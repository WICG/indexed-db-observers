
(function(global) {
  var connections = {};

  var addOpenDatabase = function(db, name){
    db._listeners = {};
    db._openTransactions = 0;
    db._closePending = false;
    connections[name] = connections[name] || [];
    connections[name].push(db);
  };
  var closeDatabase = function(db) {
    db._listeners = {};
    var list = connections[db.name];
    var index = list.indexOf(db);
    list.splice(index, 1);
  };

  var addListenerFunction = function(objectStore, fcn) {
    var db = objectStore.transaction.db;
    db._listeners[objectStore.name] = db._listeners[objectStore.name] || [];
    db._listeners[objectStore.name].push(fcn); 
  };

  var removeListenerFunction = function(objectStore, fcn) {
    var db = objectStore.transaction.db;
    var list = db._listeners[objectStore.name];
    if (!list) {
      return;
    }
    var index = list.indexOf(fcn);
    if (index === -1) {
      return;
    }
    list.splice(index, 1);
  };
  
  var pushOperation = function(objectStore, changesMap, type, keyOrRange, value) {
    if (!changesMap[objectStore.name]) {
      changesMap[objectStore.name] = { store: objectStore, changes: []};
    }
    var operation = { type: type };
    if (keyOrRange) {
      operation.key = keyOrRange;
    }
    if (value) {
      operation.value = value;
    }
    changesMap[objectStore.name].changes.push(operation);
  };

  var getListeners = function(dbName, objectStoreName) {
    if (!connections[dbName]) {
      return [];
    }
    var listeners = [];
    connections[dbName].forEach(function(db) {
      if (!db._listeners[objectStoreName]) {
        return;
      }
      listeners = listeners.concat(db._listeners[objectStoreName]);
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
  
  var $transaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function(scope, mode) {
    var tx = $transaction.apply(this, arguments);
    if (mode !== 'readwrite') return tx;
    tx._changes = [];
    tx.db._openTransactions += 1;
    tx.addEventListener('complete', function() {
      var changeMap = tx._changes;
      tx._changes = [];
      for (var objectStoreName in changeMap) {
        var listeners = getListeners(tx.db.name, objectStoreName);
        var changesRecord = changeMap[objectStoreName];
        for (var index in listeners) {
          listeners[index](changesRecord.changes, changesRecord.store);
        }
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
 
  IDBObjectStore.prototype.startObservingChanges = function(fcn) {
    addListenerFunction(this, fcn);
  };
  IDBObjectStore.prototype.stopObservingChanges = function(fcn) {
    removeListenerFunction(this, fcn);
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