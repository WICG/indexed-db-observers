# Example Use Cases

## UI Element
Let's say we're a polymer or angular webapp, and we have databinding working.

Since the observer was created with the same transaction that read in the initial data, we are guaranteed to not miss a change in between our read and when the observing starts.

```javascript
// uiComponent contains logic for updating it's own data.
var uiComponent = this;
// This function updates our UI component when the database is changed.
var updateUICallback = function(changes) {
  changes.records.get('users').forEach(function(record) {
    switch(record.type) {
      case 'clear':
        uiComponent.clear();
        break;
      case 'add':
        uiComponent.addUser(change.key, change.value);
        break;
      case 'put':
        uiComponent.updateUser(change.key, change.value);
        break;
      case 'delete':
        uiComponent.removeUser(change.key);
        break;
    }
  });
}
// Observer creation. We want to include the values,
// as we'll always use them to populate the UI.
var observer = new IDBObserver(updateUICallback);
// Create or transaction for both reading the table and attaching the observer.
var txn = db.transaction('users', 'readonly');
// We'll start seeing changes after 'txn' is complete.
observer.observe(db, txn, { values: true, operations: ['add', 'put', 'delete', 'clear'] });
// Now we read in our initial state for the component.
var usersTable = txn.objectStore('users');
var request = usersTable.getAll();
request.onsuccess = function() {
  request.result.forEach(function(user) {
    uiComponent.addUser(user.id, user);
  });
}
txn.oncomplete = function() {
  console.log('component initialized and observer started');
}
```

## Server sync worker
We want to synchronize changes to a webserver. Let's say we're storing all of our operations in an oplog, which we send to the network whenever we get changes, and then delete the records afterwards. If we ever close/crash/timeout before the records are sent, they'll be around for our next run.

We use the transaction-association feature of observers to ensure no records slip after our first read.

```javascript
// The app adds local operations to the 'oplog' object store, and
// expects those to be synced to the backend.

// Startup transaction. This reads in entries that were left over
// from the last time our page was alive - either things closed or
// we couldn't send due to network issues. We also start observing
// from this point on using this transaction.
var startupTxn = db.transaction('oplog', 'readonly');

// Helper method that removes all given operations from the oplog.
var removeOperationsFromOplog(opKeys) {
  var removalTxn = db.transaction('oplog', 'readwrite');
  var oplog = removalTxn.objectstore('oplog');
  for (let i = 0; i < keys.length; ++i) {
    oplog.delete(keys[i]);
  }
}

// Grab the possibly unsent operations from last run.
var unsentOperationKeys = startupTxn.objectstore('oplog').getAllKeys();
unsentOperationKeys.onsuccess = function() {
  var keys = unsentOperationKeys.result;
  // (readAllKeysFromIDB utility method for brevity - passes values)
  readAllKeysFromIDB(startupTxn, keys)
      .then(sendChangesToNetwork)
      .then(removeOperationsFromOplog.bind(keys))
      .catch(function() {
          // handle network error
        });
}

// Create our observer. This will start observing changes IMMEDIATELY
// AFTER startupTxn is complete. We won't double-send the changes we
// already read in startupTxn, and we won't miss any afterwards.
var observer = new IDBObserver(function(changes) {
  var changeKeys = [];
  var changesForNetwork = [];
  changes.records.get('oplog').forEach(change => {
    changeKeys.push(change.key);
    changesForNetwork.push(change.value);
  });
  sendChangesToNetwork(changesForNetwork)
      .then(removeOperationsFromOplog.bind(keys))
      .catch(function() {
          // handle network error
        });
});

// Attach the observer to the transaction.
observer.observe(db, startupTxn,
    { onlyExternal: true, values: true, operations: ['add', 'put'] });

startupTxn.oncomplete = function() {
  console.log('Observer is attached and we are syncing changes');
}
```

## Maintaining an in-memory data cache
A webapp might want to keep an in-memory cache for items it knows it often needs. Note that we don't include values here, as we want to optimize our memory usage by reading in the cache in a larger batch, and at an opportune time. Note: This can cause your webapp to run out of memory if you don't know exactly what you're doing.

```javascript
// let's assume our cache batches together reads once we get enough changes
// or a timeout occurs. So we want to give it changes, and let it optionally read
// in a bunch of data.
var usersCache = this.cache;
var updateUsersCache = function(changes) {
  usersCache.addChanges(changes.records.get('users'));
  usersCache.maybeResolveChanges(changes.transaction);
}
var observer = new IDBObserver(updateUsersCache);
var txn = db.transaction('users', 'readonly');
// Attach our observer.
var rangesMap = new Map();
rangesMap.put('users', [IDBKeyRange.bound(0, 1000]);
observer.observe(
    db, txn, {transaction: true, operations: ['add', 'put', 'delete', 'clear'], ranges: rangesMap});
// Read initial contents of the cache.
var os = txn.objectStore('users');
var readRequest = os.getAll(IDBKeyRange.bound(0, 1000), 50);
readRequest.onsuccess = function() {
  var users = readRequest.result;
  usersCache.addUsers(users);
}
txn.oncomplete = function() {
  console.log("Cache initialized and listening");
}

```

## Custom refresh logic
If we just want to know when an object store has changed. This isn't the most efficient, but this might be the 'starting block' websites use to transition to observers, as at some point they would read the database using a transaction to update their UI.
 
```javascript
// We just grab the transaction and give it to our UI refresh logic.
var refreshDataCallback = function(changes) {
  refreshDataWithTransaction(changes.transaction);
}
// We disable records, so we just get the callback without any data.
// We ask for the transaction, which guarentees we're reading the current
// state of the database and we won't miss any changes.
var observer = new IDBObserver(refreshDataCallback);
observer.observe(
    db, db.transact('users', 'readonly'),
    { noRecords: true, transaction: true, operations: ['add', 'put', 'delete', 'clear'] });
```
