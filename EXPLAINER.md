# Explainer
Documentation & FAQ of observers. See accompanying WebIDL file [IDBObservers.webidl](/IDBObservers.webidl)

**Please file an issue if you have any feedback :)**

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**

- [Why?](#why)
- [IDBTransaction.observe(...)](#idbtransactionobserve)
      - [`options` Argument](#options-argument)
      - [Observer Function](#observer-function)
          - [`changes` Argument](#changes-argument)
          - [`records`](#records)
      - [Return Value & Lifetime](#return-value--lifetime)
      - [Example Usage](#example-usage)
- [Observation Consistency & Guarantees](#observation-consistency--guarantees)
- [Examples](#examples)
- [Open Issues](#open-issues)
- [Feature Detection](#feature-detection)
- [Spec changes](#spec-changes)
  - [Observer Creation](#observer-creation)
  - [Observer Control](#observer-control)
  - [Change Recording](#change-recording)
  - [Observer Calling](#observer-calling)
- [Future Features](#future-features)
  - [Culling](#culling)
    - [Culling Spec Changes](#culling-spec-changes)
      - [Add Operation](#add-operation)
      - [Put Operation](#put-operation)
      - [Delete Operation](#delete-operation)
      - [Clear Operation](#clear-operation)
- [FAQ](#faq)
    - [Observing onUpgrade](#observing-onupgrade)
    - [Why not expose 'old' values?](#why-not-expose-old-values)
    - [Why not issue 'deletes' instead a 'clear'?](#why-not-issue-deletes-instead-a-clear)
    - [How do I know I have a true state?](#how-do-i-know-i-have-a-true-state)
    - [Why only populate the objectStore name in the `changes` records map?](#why-only-populate-the-objectstore-name-in-the-changes-records-map)
    - [Why not use ES6 Proxies?](#why-not-use-es6-proxies)
    - [Why not more like Object.observe?](#why-not-more-like-objectobserve)
    - [What realm are the change objects coming from?](#what-realm-are-the-change-objects-coming-from)
    - [Why not observe from ObjectStore object?](#why-not-observe-from-objectstore-object)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->
# Why?
IndexedDB doesn't have any observer support. This could normally be implemented by the needed website (or third party) as a wrapper around the database. However, IDB spans browsing contexts (tabs, workers, etc), and implementing a javascript wrapper that supports all of the needed features would be very difficult and performance optimization of the features would be impossible. This project aims to add IndexedDB observers as part of the specification.

Use cases for observers include:
 * Updating the UI from database changes (data binding).
 * Syncing local state from background worker (like a ServiceWorker) or another tab making changes.
 * Serializing changes for network communication.
 * Maintaining an in-memory cache.
 * Simplified application logic.

# Example Uses

## UI Element
Let's say we're a polymer or angular webapp, and we have databinding working. **We rely on the guarantee that the observer will start immediately after the transaction it was created with**.

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
var observer = new IndexedDBObserver(
    updateUICallback, { values: true, operations: ['add', 'put', 'delete', 'clear'] });
// Create or transaction for both reading the table and attaching the observer.
var txn = db.transaction('users', 'readonly');
// We'll start seeing changes after 'txn' is complete.
observer.observe(db, txn);
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
We want to synchronize changes to a webserver. Let's say we're storing all of our operations in an oplog, which we send to the network whenever we get changes, and then delete the records afterwards. If we ever close/crash/timeout before the records are sent, they'll be around for our next run. **We rely on the guarantee that the observer will start immediately after the transaction it was created with**.

```javascript
// We are bad developers and don't batch our network calls.
// We just send them whenever there's a change.
var onDatabaseChanges = function(changes) {
  var changesForNetwork = [];
  changes.records.get('oplog').forEach(change => {
    changesForNetwork.push(change);
  });
  sendChangesToNetwork(changesForNetwork).then(function() {
      var removalTxn = db.transaction('oplog', 'readwrite');
      removalTxn.objectstore('oplog').delete(changesForNetwork); // psuedocode here
    });
}
var observer = new IndexedDBObserver(
    onDatabaseChanges, { onlyExternal: true, values: true, operations: ['add', 'put'] });

var txn = db.transaction('oplog', 'readonly');
observer.observe(db, txn);
// Here we catch any changes that we missed due to crashing
// or shutting down.
var readAll = txn.getAll();
readAll.onsuccess = function() {
  sendPendingChangesToNetwork(readAll.result).then(function() {
      var removalTxn = db.transaction('oplog', 'readwrite');
      removalTxn.objectstore('oplog').delete(readAll.result); // psuedocode here
    }).catch(function(){
      // couldn't send changes to network.
    });
}
txn.oncomplete = function() {
  console.log('Database is initialized and we are syncing changes');
}
```

## Maintaining an in-memory data cache
IDB can be slow due to disk, so it's a good idea to have an in-memory cache.  Note that we don't include values here, as we want to optimize our memory usage by reading in the cache in a larger batch, and at an opportune time. **We rely on the guarantee that the observer will start immediately after the transaction it was created with**.

```javascript
// let's assume our cache batches together reads once we get enough changes
// or a timeout occurs. So we want to give it changes, and let it optionally read
// in a bunch of data.
var usersCache = this.cache;
var updateUsersCache = function(changes) {
  usersCache.addChanges(changes.records.get('users'));
  usersCache.maybeResolveChanges(changes.transaction);
}
var observer = new IndexedDBObserver(
    updateUsersCache, { transaction: true, operations: ['add', 'put', 'delete', 'clear'] });
var txn = db.transaction('users', 'readonly');
// Attach our observer.
var optionsMap = new Map();
optionsMap.put('users', { ranges: IDBKeyRange.bound(0, 1000)});
observer.observe(db, txn, optionsMap);
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
var observer = new IndexedDBObserver(
    refreshDataCallback, { noRecords: true, transaction: true, operations: ['add', 'put', 'delete', 'clear'] });
observer.observe(db, db.transact('users', 'readonly'));
```

# interface IDBObserver
The interface [`IDBObserver`](/IDBObservers.webidl) is added. This object owns the callback and options of the observer. We then use this object to observe databases (or targets), similar to IntersectionObserver and MutationObserver.

## new IDBObserver(callback, options)
This creates the observer object with the callback and options. All observations initated with this object will use the given callback and options.

**The operations option is required, and cannot be an empty list.**

#### `options` Argument
```js
// Example options object.
// Note: all default values are false. The only required attribute is 'operations', and it can't be empty.
options: {
  transaction:  false,  // Includes a readonly transaction in the observer callback, over all the object stores we're observing.
  values: false, // Includes the values of each row changed.
  noRecords: false, // Removes all records, and just tells us when things change.
  onlyExternal: false,  // Only listen for changes from other database connections.
  operations: ['put', 'add', 'delete', 'clear'] // Filter our change operations.
}
```

More explanation of each option:

 * `operations` is required, and lists the operations that the observer wants to see. This cannot be empty. Accepted values are `put`, `add`, `delete`, and `clear`.
 * If `transaction` is specified, then this creates a readonly transaction for the objectstores that you're observing every time the observer function is called. This transaction provides a snapshot of the post-commit state. This does not go through the normal transaction queue, but can delay subsequent transactions on the observer's object stores. The transaction is active during the callback, and becomes inactive at the end of the callback task or microtask.
 * If `onlyExternal` is specified, then only changes from other database connections will be observed. This can be another connection on the same page, or a connection from a different browsing context (background worker, tab, etc).
 * If `value` is specified, then values for all `put` and `add` will be included for the resptive object stores. However, these values can be large depending on your use of the IndexedDB.
 * If `noRecords` is specified, then the observer will be called for all changes, but no records will be included in the changes object for that object store. This is the most lightweight option having an observer.

## IDBObserver.observe(...)
The function [`IDBObserver.observe(database, transaction, ranges)`](/IDBObservers.webidl) is added.

This function starts observation on the target database connection using the given transaction. We start observing the object stores that the given transaction is operating on (the object stores returned by `IDBTransaction.objectStoreNames`). Observation will start at the end of the given transaction, and the observer's callback function will be called at the end of every transaction that operates on the chosen object stores until either the database connection is closed or `IDBObserver.unobserve` is called with the target database.

### `ranges` Argument
The ranges argument lets us specify the specific IDBKeyRanges that we want to observer, per object store.

// Example 'ranges' map:
{
  'objectStoreName1': => [IDBKeyRange.bound(0, 10), IDBKeyRange.lowerBound(100)],
  'objectStoreName2' => [IDBKeyRange.only(0)]
}

## IDBObserver.unobserve(database)
This stops observation of the given target database connection. This will stop all `observe` registrations to the given database connection.

#### Observer Function
The observer function will be called whenever a transaction is successfully completed on the applicable object store/s. There is one observer callback per applicable transaction.

The observer functionality starts after the the transaction the observer was created in is completed. This allows the creator to read the 'true' state of the world before the observer starts. In other words, this allows the developer to control exactly when the observing begins.

The function will continue observing until either the database connection used to create the transaction is closed (and all pending transactions have completed), or `stop()` is called on the observer.

###### `changes` Argument
The **`changes`** argument includes the following:
```js
changes: {
  db: <object>, // The database connection object. If null, then the change
                // was from a different database connection.
  transaction: <object>, // A readonly transaction over the object stores that
                         // this observer is listening to. This is populated when
                         // includeTransaction is set in the options.
  records: Map<string, Array<object>> // The changes, outlined below.
}
```
(see [IDBObservers.webidl](IDBObservers.webidl))

###### `records`
The records value in the changes object is a javascript Map of object store name to the array of change records. This allows us to include changes from multiple object stores in our callback. (Ex: you are observing object stores 'a' and 'b', and a transaction modifies both of them)

The `key` of the map is the object store name, and the `value` element of the map is a JS array, with each value containing:
 * `type`: `add`, `put`, `delete`, or `clear`
 * optional `key`: The key or IDBKeyRange for the operation (the `clear` type does not populate a key)
 * optional `value`: The value inserted into the database by `add` or `put`. Included if the `values` option is specified. Note: this is **not included for `delete` or `clear` operations**, because that would require reading from the database instead of just recording our change operations.

Example **records** Map object:
```js
{'objectStore1' => [{type: "add", key: IDBKeyRange.only(1), value: "val1"},
                    {type: "add", key: IDBKeyRange.only(2), value: "val2"},
                    {type: "put", key: IDBKeyRange.only(4), value: "val4"},
                    {type: "delete", key: IDBKeyRange.bound(5, 6, false, false)}],
 'objectStore2' => [{type: "add", key: IDBKeyRange.only(1), value: "val1"},
                    {type: "add", key: IDBKeyRange.only(2), value: "val2"}]}
```

Note: `putAll` and `addAll` operations could be seperated into individual put and add changes.

#### Return Value & Lifetime
The observer will hold a strong reference to the callback and database connections that the observer is observing hold a reference to the observer. The database releases it's connections to it's observers when either `unobserve(db)` is called, or the database connection is closed.

In cases like corruption, the database connection is automatically closed, and that will then close all of the observers (see Issue #9).

# Observation Consistency & Guarantees
To give the observer strong consistency of the world that it is observing, we need to allow it to
 1. Know the contents of the observing object stores before observation starts (after which all changes will be sent to the observer)
 2. Read the observing object stores at each change observation.

We accomplish #1 by incorporating a transaction into the creation of the observer. After this transaction completes (and has read anything that the observer needs to know), all subsequent changes to the observing object stores will be sent to the observer.

For #2, we optionally allow the observer to
 1. Include the values of the changed keys.  Since we know the initial state, with the keys & values of all changes we can maintain a consistent state of the object stores.
 2. Include a readonly transaction of the observing object stores.  This transaction is scheduled right after the transaction that made these changes, so the object store will be consistent with the 'post observe' world.

# Examples (old)
See the html files for examples, hosted here:
https://dmurph.github.io/indexed-db-observers/

# Open Issues
Issues section here: https://github.com/WICG/indexed-db-observers/issues

# Feature Detection
I'm not sure how we're going to do feature detection. What do you think? What is normal on the web platform?

# Spec changes
These are the approximate spec changes that would happen. See [IDBObservers.webidl](IDBObservers.webidl) for the WebIDL file.

The following extra 'hidden variables' will be kept track of in the spec inside of IDBTransaction:
 * `pending_observer_construction` - a list of {uuid string, options map, callback function} tuples.
 * `change_list` - a per-object-store list of { operation string, optional key IDBKeyRange, optional value object}.  The could be done as a map of object store name to the given list.

## Observer Creation
When the observe method is called on a transaction, the given options, callback, and the transaction's object stores are given a unique id and are stored in a `pending_observer_construction` list as an `Observer`.  This id is given to the observer control, which is returned. When the transaction is completed successfuly, the Observer is added to the domain-specific list of observers.  If the transaction is not completed successfuly, this does not happen.

## Change Recording
Every change would record an entry in the `change_list` for the given object store.

## Observer Calling
When a transaction successfully completes, send the `change_list` changes to all observers that have objects stores touched by the completed transaction. When sending the changes to each observer, all changes to objects stores not observed by the observer are filtered out.


# Future Features

## Culling
The changes given to the observer could be culled. This eliminated changes that are overwritten in the same transaction or redundant. Here are some examples:
 1. add 'a', 1
 2. add 'b', 2
 3. put 'putA', 1
 4. delete 2

These changes can **culled** to simply be
 1. add 'putA', 1

In addition, deletes are combined when applicable:
 1. delete [0, 5]
 2. put '1' 1
 3. put '6' 6
 4. delete [5, 6)
 5. delete [6, 7)

This is culled to:
 1. delete [0, 7)
 2. put '1' 1

Note that these operations are still ordered. They are not a disjoint set.

This would be an boolean option in the IDBObserverDataStoreOptions object, `culling`.

### Culling Spec Changes
Whenever a change succeeds in a transaction, it adds it to a `culled_change_list` for the given object store in the following manner:

(Note: `putAll` and `addAll` operations could be seperated into individual put and add changes.)

#### Add Operation
Append the add operation, key and value, on end of operations list.

#### Put Operation
1. Iterate backwards in the `culled_change_list` and look for any 'add', 'put' or 'delete' change with an **intersecting key**.
2. If a put is reached, delete that entry from the list.
3. If an add is reached, replace the value of the add with the new put value and return.
4. If a delete is reached, then append the new put at the end of operations and return.
5. If the end of the list is reached, then append the new put at the end of operations and return.

#### Delete Operation
1. Iterate backwards in the `culled_change_list` and look for any 'add', 'put' or 'delete' change with an **intersecting key**.
2. If a put is reached, delete that entry from the list.
3. If an add is reached, delete that entry from the list.
4. If a delete is reached, modify the reached delete to be a union of it's current range and the new delete range.
5. If we reach the end of the operations list and the new delete was never combined with an older delete, append the delete to the list of operations.

#### Clear Operation
1. Clear the `culled_change_list` for that object store.
2. Add a 'clear' operation to list.

# FAQ
### Observing onUpgrade
This spec does not offer a way to observe during onupgrade. Potential clients voiced they wouldn't need this feature. This doesn't seem like it's needed either, as one can just read in any data they need with the transaction used to do the upgrading.  Then the observer is guarenteed to begin at the end of that transaction (if one is added), and it wouldn't miss any chanage.

### Why not expose 'old' values?
IndexedDB was designed to allow range delete optimizations so that `delete [0,10000]` doesn't actually have to physically remove those items to return. Instead we can store range delete metadata to shortcut these operations when it makes sense. Since we have many assumptions for this baked our abstraction layer, getting an 'original' or 'old' value would be nontrivial and incur more overhead.

### Why not issue 'deletes' instead a 'clear'?
Following from the answer above, IndexedDB's API is designed to allow mass deletion optimization, and in order to have the 'deletes instead of clear' functionality, this would involve expensive read operations within the database.  If an observer needed to know exactly what was deleted, they can maintain their own state of the keys that they care about.

### How do I know I have a true state?
One might need to guarantee that their observer can see a true, consistent state of the world. This is guarenteed by the way the observer is created within a transaction. When that transaction completes, the observer will be notified for all subsequent transations. Any initial state the observer needs can be read in the initial transaction.

One can also specify the `includeTransaction` option. This means that every observation callback will receive a readonly transaction for the object store/s that it is observing. It can then use this transaction to see the true state of the world. This transaction will take place immediately after the transaction in which the given changes were performed is completed.

### Why only populate the objectStore name in the `changes` records map?
Object store objects are only valid when retrieved from transactions. The only relevant information of that object outside of the transaction is the name of the object store. Since the transaction is optional for the observation callback, we aren't guaranteed to be able to create the IDBObjectStore object for the observer.  However, it is easy for the observer to retrieve this object by
 1. Specifying `includeTransaction` in the options map
 2. calling changes.transaction.objectStore(name)

### Why not use ES6 Proxies?
The two main reasons are:
 1. We need to observe changes across browsing contexts. Passing a proxy across browsing contexts in not possible, and it's infeasible to have every browsing context create a proxy and give it to everyone else (n*n total proxies).
 2. Changes are committed on a per-transaction basis, and can include changes to multiple object stores. We can encompass this is an easy way when we control the observation function, where this would require specialized and complex logic by the client if it was proxy-based.

### What realm are the change objects coming from?
All changes (the keys and values) are structured cloneable, and are cloned from IDB. So they are not coming from a different realm.

### Why not observe from ObjectStore object?
This makes it so developers cannot reliable observe multiple object stores at the same time.  Example:

Given
 * Object stores os1, os2
 * Observers o1, o2 (listening to os1, os2 respectively)

Order of operations
 * T1 modified os1, os2
 * o1 gets changes from T1
 * T2 modifies o1
 * o2 gets changes from T1
 * o1 gets changes from T2

Even if o1 records the changes from T1 for o2, there is no guarantee that o2 it gets the changes from T1 before another transaction changes o1 again.

We also believe that keeping the 'one observer call per transaction commit' keeps observers easy to understand.
