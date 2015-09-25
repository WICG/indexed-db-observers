(function(global) {
  function generateUUID(){
      var d = new Date().getTime();
      var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          var r = (d + Math.random()*16)%16 | 0;
          d = Math.floor(d/16);
          return (c=='x' ? r : (r&0x3|0x8)).toString(16);
      });
      return uuid;
  }
  var earlyAbortListeners = new Set();
  var listenerMap = new Map();
  var connections = new Map();
  
  var generateControlForUUID = function(uuid) {
    var control = {
      isAlive: function() {
        if (!listenerMap.has(uuid)) {
          return false;
        }
        return listenerMap.get(uuid).alive;
      },
      stop: function() {
        if (!listenerMap.has(uuid)) {
          earlyAbortListeners.add(uuid);
          return;
        }
        var listener = listenerMap.get(uuid);
        
        listener.ranges.forEach(function(range, osName) {
          var list = listener.db._listeners.get(osName);
          if (!list) {
            console.error('could not find list for object store ' + osName);
            return;
          }
          var index = list.indexOf(listener);
          if (index === -1) {
            console.error('could not find listener in list for object store ' + osName);
            return;
          }
          list.splice(index, 1);
          listener.db._listeners.set(osName, list);
        }, this);
        listener.alive = false;
      }
    };
    return control;
  }

  // to avoid collisions like '__proto__'

  var keyInRange = function(range, key, keyOpen) {
    var lowerOpen = keyOpen || range.lowerOpen;
    var upperOpen = keyOpen || range.upperOpen;
    return ((lowerOpen && indexedDB.cmp(key, range.lower) > 0) ||
            (!lowerOpen && indexedDB.cmp(key, range.lower) >= 0)) &&
           ((upperOpen && indexedDB.cmp(key, range.upper) < 0) ||
            (!lowerOpen && indexedDB.cmp(key, range.upper) <= 0))
  };
  var rangesIntersect = function(range1, range2) {
    var lower1Open = range1.lowerOpen || range2.upperOpen;
    var upper1Open = range1.upperOpen || range2.lowerOpen;
    return ((lower1Open && indexedDB.cmp(range1.lower, range2.upper) < 0) ||
            (!lower1Open && indexedDB.cmp(range1.lower, range2.upper) <= 0)) &&
           ((upper1Open && indexedDB.cmp(range1.upper, range2.lower) > 0) ||
            (!upper1Open && indexedDB.cmp(range1.upper, range2.lower) >= 0));
  }
  var rangesTouch = function(range1, range2) {
    var lower1Open = range1.lowerOpen && range2.upperOpen;
    var upper1Open = range1.upperOpen && range2.lowerOpen;
    return ((lower1Open && indexedDB.cmp(range1.lower, range2.upper) < 0) ||
            (!lower1Open && indexedDB.cmp(range1.lower, range2.upper) <= 0)) &&
           ((upper1Open && indexedDB.cmp(range1.upper, range2.lower) > 0) ||
            (!upper1Open && indexedDB.cmp(range1.upper, range2.lower) >= 0));
  }
  var rangeInRange = function(outsideRange, range2) {
    var lower1Open = outsideRange.lowerOpen && !range2.lowerOpen;
    var upper1Open = outsideRange.upperOpen && !range2.upperOpen;
    return ((lower1Open && indexedDB.cmp(outsideRange.lower, range2.lower) < 0) ||
            (!lower1Open && indexedDB.cmp(outsideRange.lower, range2.lower) <= 0)) &&
           ((upper1Open && indexedDB.cmp(outsideRange.upper, range2.upper) > 0) ||
            (!upper1Open && indexedDB.cmp(outsideRange.upper, range2.upper) >= 0));
  }
  var unionRanges = function (range1, range2) {
    var lower;
    var lowerOpen; 
    var upper;
    var upperOpen;
    if (range1.lower == range2.lower) {
      lower = range1.lower;
      lowerOpen = range1.lowerOpen || range2.lowerOpen;
    } else if (range1.lower < range2.lower) {
      lower = range1.lower;
      lowerOpen = range1.lowerOpen;
    } else {
      lower = range2.lower;
      lowerOpen = range2.lowerOpen;
    }
    if (range1.upper == range2.upper) {
      upper = range1.upper;
      upperOpen = range1.upperOpen || range2.upperOpen;
    } else if (range1.upper > range2.upper) {
      upper = range1.upper;
      upperOpen = range1.upperOpen;
    } else {
      upper = range2.upper;
      upperOpen = range2.upperOpen;
    }
    return IDBKeyRange.bound(lower, upper, lowerOpen, upperOpen);
  } 

  var filterForRange = function(range) {
    return function(element) {
      if (element.type == "clear") {
        return true;
      }
      if (element.key instanceof IDBKeyRange) {
        return rangesIntersect(element.key, range);
      } else {
        return keyInRange(range, element.key, false);
      }
    };
  }

  // returns if we should add the new change
  var cullChangesForNewChange = function(changeInfo, newChange) {
    if (changeInfo.changes.length == 0) {
      return true;
    }
    if (newChange.type === 'clear') {
      changeInfo.changes = [];
      changeInfo.valueChanges = [];
      changeInfo.index = new Map();
    }
    if (newChange.type === 'add') {
      // if this was successful, we don't have anything before us to cull.
      return true;
    }
    if (newChange.type === 'put') {
      if (changeInfo.index.has(newChange.key)) {
        var oldChange = changeInfo.index.get(newChange.key);
        if (oldChange.type === 'add') {
          newChange.type = 'add';
        }
        var index = changeInfo.changes.indexOf(oldChange);
        changeInfo.changes.splice(index, 1);
        changeInfo.valueChanges.splice(index, 1);
      }
      return true;
    }
    if (newChange.type !== 'delete') {
      console.log('Error, unrecognized type: ', newChange.type);
      return false;
    }
    for (var i = changeInfo.changes.length-1; i >= 0; i--) {
      var change = changeInfo.changes[i];
      switch(change.type) {
        case 'clear':
          return false;
        case 'delete':
          if (rangeInRange(change.key, newChange.key)) {
            // previous delete already does us
            return false;
          }
          if (rangesTouch(change.key, newChange.key)) {
            // we intersect with an old change, so expand the old change with the new one.
            change.key = unionRanges(change.key, newChange.key);
            return false;
          }
          break;
        case 'add':
        case 'put':
          if (keyInRange(newChange.key, change.key, false)) {
            changeInfo.changes.splice(i, 1);
            changeInfo.valueChanges.splice(i, 1); 
          }
          break;
      }
    }
    return true;
  };

  var addOpenDatabase = function(db, name){
    db._listeners = new Map();
    db._openTransactions = 0;
    db._closePending = false;
    if (!connections.has(name)) {
      connections.set(name, []);
    }
    connections.get(name).push(db);
  };

  var closeDatabase = function(db) {
    db._listeners.forEach(function(list, osName) {
      for (var i = 0; i < list.length; i++) {
        list[i].alive = false;
      }
    }, this);
    
    db._listeners.clear();
    var list = connections.get(db.name);
    if (!list) {
      console.log('Cannot find db connection for name ' + db.name);
      return;
    }
    var index = list.indexOf(db);
    list.splice(index, 1);
  };

  // returns control object
  var addObserver = function(uuid, db, objectStoreNames, fcn, options) {
    var osToRange = new Map();
    if (options.onlyExternal) {
      console.error('External changes (multiple browsing contexts) are not supported.' +
                    'Observer is effectively a no-op until that is done.  Sorry!');
    }
    for (var i = 0; i < objectStoreNames.length; i++) {
      var name = objectStoreNames[i];
      osToRange.set(name, options.ranges ? options.ranges[name] : null);
    }
    var listener = { uuid: uuid, db: db, fcn: fcn, ranges: osToRange, alive: true, options: options };

    for (var i = 0; i < objectStoreNames.length; i++) {
      var name = objectStoreNames[i];
      if (!db._listeners.has(name)) {
        db._listeners.set(name, []);
      }
      db._listeners.get(name).push(listener);
    }
    listenerMap.set(uuid, listener);
  };

  var hasListeners = function(dbname, osName) {
    var dbs = connections.get(dbname);
    if (!dbs) {
      return false;
    }
    for (var i = 0; i < dbs.length; i++) {
      var listeners = dbs[i]._listeners;
      if (listeners && listeners.has(osName) && listeners.get(osName).length > 0) {
        return true;
      }
    }
    return false;
  };
  // protected name
  var hasListenersForValues = function(dbname, osName) {
    var dbs = connections.get(dbname);
    if (!dbs) {
      return false;
    }
    for (var i = 0; i < dbs.length; i++) {
      var listeners = dbs[i]._listeners;
      if (listeners && listeners.has(osName)) {
        var list = listeners.get(osName);
        for (var i = 0; i < list.length; i++) {
          if (list[i].options.includeValues) {
            return true;
          }
        }
      }
    }
    return false;
  };
  
  var pushOperation = function(objectStore, changesMap, type, keyOrRange, value) { 
    var name = objectStore.name;
    if (!hasListeners(objectStore.transaction.db.name, name)) {
      console.log("no listeners found")
      return;
    }
    if (!changesMap.has(name)) {
      changesMap.set(name, { changes: [], valueChanges: [], index: new Map() });
    }
    var changeInfo = changesMap.get(name);
    var operation = { type: type };
    if (keyOrRange) {
      operation.key = keyOrRange;
    }
    var shouldAdd = cullChangesForNewChange(changeInfo, operation);
    if (!shouldAdd) {
      return;
    }
    if (keyOrRange && !(keyOrRange instanceof IDBKeyRange)) {
      changeInfo.index.set(
          keyOrRange, operation);
    }
    if (hasListenersForValues(objectStore.transaction.db.name, name)) {
      var valueOperation = { type: operation.type };
      if (keyOrRange) {
        valueOperation.key = operation.key;
      }
      if (value) {
        valueOperation.value = value;
      }
      changeInfo.valueChanges.push(valueOperation);
    }
    changeInfo.changes.push(operation);
  };

  var getListeners = function(dbName, objectStoreName) {
    if (!connections.has(dbName)) {
      return [];
    }
    var listeners = [];
    connections.get(dbName).forEach(function(db) {
      if (!db._listeners.has(objectStoreName)) {
        return;
      }
      listeners = listeners.concat(db._listeners.get(objectStoreName));
    });
    return listeners;
  };

  var getListenersForDb = function(dbName) {
    if (!connections.has(dbName)) {
      return [];
    }
    var listeners = [];
    connections.get(dbName).forEach(function(db) {
      db._listeners.forEach(function(list) {
        listeners = listeners.concat(list);
      });
    });
    return listeners;
  };

  var $open = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function(name /*, version*/) {
    var request = $open.apply(this, arguments);
    request.addEventListener('success', function() {
      var connection = request.result;
      addOpenDatabase(connection, name);
    });
    return request;
  };

  var $close = IDBDatabase.prototype.close;
  IDBDatabase.prototype.close = function() {
    $close.apply(this, arguments);
    if (this._openTransactions === 0) {
      closeDatabase(this);
    } else {
      this._closePending = true;
    }
  };

  var supportedOptions = {
    includeValues: true,
    includeTransaction: true,
    excludeRecords: true,
    onlyExternal: true
  };

  IDBTransaction.prototype.observe = function(listenerFunction, options) {
    if (arguments.length == 0) {
      return supportedOptions;
    }
    var sanatizedOptions = {
      includeValues: options ? !!options.includeValues : false,
      includeTransaction: options ? !!options.includeTransaction : false,
      excludeRecords: options ? !!options.excludeRecords : false,
      onlyExternal: options ? !!options.onlyExternal : false
    }
    if (options && options.ranges) {
      if (options.ranges instanceof Map) {
        sanatizedOptions.ranges = options.ranges;
      } else {
        console.error('Ranges option must be a map.');
        return null;
      }
    }
    var pendingObserver = { uuid: generateUUID(), fcn: listenerFunction, options: sanatizedOptions};
    this._pendingObservers.push(pendingObserver);
    console.log(pendingObserver);
    return generateControlForUUID(pendingObserver.uuid);
  };

  var $transaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function(scope, mode) {
    var tx = $transaction.apply(this, arguments);
    tx.objectStoreNames = scope;
    tx._pendingObservers = new Array();
    if (mode == 'readwrite') {
      tx._changes = new Map();
      tx.db._openTransactions += 1;
    }
    tx.addEventListener('complete', function() {
      console.log(tx._pendingObservers);
      if (tx._pendingObservers.length != 0) {
        console.log("adding observers!")
        for (var observer of tx._pendingObservers) {
          if (earlyAbortListeners.has(observer.uuid)) {
            continue;
          }
          addObserver(observer.uuid, this.db, this.objectStoreNames, observer.fcn, observer.options);
        }
      }
      if (tx._changes == undefined) {
        return;
      }
      var changeMap = tx._changes;
      tx._changes = [];
      var listeners = getListenersForDb(tx.db.name);
      for (var listener of listeners) {
        var changes = {
          db: listener.db,
          transaction: undefined,
          isExternalChange: false,
          records: new Map()
        };
        listener.ranges.forEach(function(range, osName) {
            if (!changeMap.has(osName)) {
              console.log(osName +" not found in map");
              return;
            }
            var changesRecord = changeMap.get(osName);
            var osRecords = changesRecord.changes;
            if (listener.options.includeValues) {
              osRecords = changesRecord.valueChanges;
            }
            if (range) {
              osRecords = osRecords.filter(filterForRange(range));
            }
            if (osRecords.length == 0) {
              return;
            }
            if (listener.options.excludeRecords) {
              osRecords = null;
            }
            changes.records.set(osName, osRecords);
          });
        if (listener.options.includeTransaction) {
          var osNames = listener.ranges.keys();
          changes.transaction = tx.db.transaction(osNames, 'readonly');
        }
        listener.fcn(changes);
      }
      tx.db._openTransactions -= 1;
      if (tx.db._closePending) {
        closeDatabase(tx.db);
      }
    });
    tx.addEventListener('abort', function() {
      tx.db._openTransactions -= 1;
      if (tx.db._closePending) {
        closeDatabase(tx.db);
      }
    })
    return tx;
  };

  var $put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function(value /*, key*/) {
    var $this = this;
    var request = $put.apply(this, arguments);
    request.addEventListener('success', function() {
      var key = request.result;
      pushOperation($this, $this.transaction._changes, 'put', key, value);
    });
    return request;
  };
 
  var $add = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function(value /*, key*/) {
    var $this = this;
    var request = $add.apply(this, arguments);
    request.addEventListener('success', function() {
      var key = request.result;
      pushOperation($this, $this.transaction._changes, 'add', key, value);
    });
    return request;
  };
 
  var $delete = IDBObjectStore.prototype.delete;
  IDBObjectStore.prototype.delete = function(key_or_range) {
    var $this = this;
    var request = $delete.apply(this, arguments);
    request.addEventListener('success', function() {
      pushOperation($this, $this.transaction._changes, 'delete', key_or_range);
    });
    return request;
  };
 
  var $clear = IDBObjectStore.prototype.clear;
  IDBObjectStore.prototype.clear = function() {
    var $this = this;
    var request = $clear.apply(this, arguments);
    request.addEventListener('success', function() {
      pushOperation($this, $this.transaction._changes, 'clear');
    });
    return request;
  };
 
  function effectiveStore(source) {
    return ('objectStore' in source) ? source.objectStore : source;
  }
 
  var $update = IDBCursor.prototype.update;
  IDBCursor.prototype.update = function(value) {
    var $this = this;
    var key = $this.primaryKey;
    var request = $update.apply(this, arguments);
    request.addEventListener('success', function() {
      var store = effectiveStore($this);
      pushOperation(store, store.transaction._changes, 'put', key, value);
    });
    return request;
  };
 
  var $cursorDelete = IDBCursor.prototype.delete;
  IDBCursor.prototype.delete = function() {
    var $this = this;
    var key = $this.primaryKey;
    var request = $cursorDelete.apply(this, arguments);
    request.addEventListener('success', function() {
      var store = effectiveStore($this);
      pushOperation(store, store.transaction._changes, 'delete', key);
    });
    return request;
  };
 
}(this));