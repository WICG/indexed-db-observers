# indexed-db-observers
Prototyping and discussion around indexeddb observers.
Please file an issue if you have any feedback :)
<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**

- [Objective](#objective)
- [API Additions](#api-additions)
    - [IDBObjectStore.startObservingChanges(function(changes){...})](#idbobjectstorestartobservingchangesfunctionchanges)
    - [IDBObjectStore.stopObservingChanges(function(changes){...})](#idbobjectstorestopobservingchangesfunctionchanges)
- [Examples](#examples)
- [Open Issues](#open-issues)
    - [Observing a key range](#observing-a-key-range)
    - [Observing all stores](#observing-all-stores)
    - [Representation of `changes` given to observer](#representation-of-changes-given-to-observer)
- [FAQ](#faq)
    - [Why create the observer in a transaction?](#why-create-the-observer-in-a-transaction)
    - [Why not expose 'old' values?](#why-not-expose-old-values)
- [Try it out!](#try-it-out)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->
# Objective
IndexedDB needs a way to observe changes.  This project is for exploring API changes to make this possible.  Everything here is up for discussion, please file an issue if you have any feedback.

I want to solve the following use cases:
 * Updating the UI from database changes
 * Syncing local state from background worker (like a ServiceWorker) or another tab making changes.

TODO: Write testharness.js

# API Additions
### IDBObjectStore.startObservingChanges(fcn(changes, objectStore){...})
```
function observerFunction(changes, objectStore) {
  console.log("Observer received changes for object store '" + objectStore.name + "': " + JSON.stringify(changes));
  for (var i = 0; i < changes.length; i++) {
    var change = changes[i];
    // do something with change.type and change.key
  }
}

// ... assume 'db' is the database connection
var txn = db.transaction(['objectStore'], 'readwrite');
txn.objectStore('objectStore').startObservingChanges(observerFunction);
```
The passed function will be called whenever a transaction is successfully completed on the given object store.  The `changes` argument is a JS array, with each value containing:
 * `type`: `add`, `put`, `delete`, or `clear`
 * `key`: The key or IDBKeyRange for the operation
 * `value`: The value inserted into the database by `add` or `put`

Example list:
```
[{"type":"add","key":1,"value":"val1"},
 {"type":"add","key":2,"value":"val2"},
 {"type":"put","key":4,"value":"val4"},
 {"type":"delete","key":{"upperOpen":false,"lowerOpen":false,"upper":2,"lower":0}}]
```
The function will continue observing until either the database connection used to create the transaction is closed (and all pending transactions have completed), or `stopObservingChanges` is called.

### IDBObjectStore.stopObservingChanges(fcn(changes, objectStore){...})
```
// ... assuming the above code was called, where db and observerFunction are defined
var txn = db.transaction(['objectStore'], 'readwrite');
txn.objectStore('objectStore').stopObservingChanges(observerFunction);
```
This removes the given function as an observer of the object store.

# Examples
See the html files for examples, hosted here:
https://dmurph.github.io/indexed-db-observers/ 

# Open Issues
### Observing a key range
Should we allow observing just a key range instead of the whole object store?

### Observing all stores
Is it valuable to globally observe changes, or observe the creation/deletion of object stores?

### Representation of `changes` given to observer
There are 3 options I can think of for the changes given to the observer:
 1. All/Unfiltered
 2. Culled
 3. Culled and Disjoint (unordered)

The current polyfill just replays **all** changes in an array.  This can be overkill, especially if these changes overlap.  Take, for example, the following changes:
 1. add 'a', 1
 2. add 'b', 2
 3. put 'putA', 1
 4. delete 2

These changes can **culled** to simply be
 1. add 'putA', 1

Another case involves range delete:
 1. put 'a', 1
 2. put 'b', 30
 3. delete range [20,40]
 4. add 'c', 31

Here we can **cull** and represent the operations as
 1. put 'a', 1
 2. delete range [20,40]
 3. add 'c', 31

OR we can have transform this into the **unordered/disjoint** change list
 * put 'a' 1
 * delete range [20,31)
 * delete range (31,40]
 * add 'c', 31

(where these changes can be performed in any order)

Personally, I vote for **culling** but not transforming to the disjoint list.  If the developer wants, they can transform the ordered culled list to the unordered version, but they wouldn't be able to transform the other way.

# FAQ
### Why create the observer in a transaction?
The observer needs to have a 'true' state of the world when it starts observing.  It shouldn't observe from the middle of another transaction that could fail or abort.  So we need to register the observer in a transaction to guarentee that we start observing from an unchanging state of the world.

### Why not expose 'old' values?
IndexedDB was designed to allow range delete optimizations so that `delete [0,10000]` doesn't actually have to physically remove those items to return.  Instead we can store range delete metadata to shortcut these operations when it makes sense.  Since we have many assumptions for this baked our abstraction layer, getting an 'original' or 'old' value would be nontrivial and incur more overhead.

# Try it out!
Import the polyfill to try it out:
```
<script src="//dmurph.github.io/indexed-db-observers/polyfill.js"></script>
```
Polyfill Caveats:
 * It doesn't broadcast accross browsing contexts
 * No culling of changes

Here is a quick start that you can paste:
``` 
<script src="//dmurph.github.io/indexed-db-observers/polyfill.js"></script>
<script>
function store1ObserverFunction(changes) {
  console.log("Observer received changes for store '" + objectStore.name + "': " + JSON.stringify(changes));
  for (var i = 0; i < changes.length; i++) {
    var change = changes[i];
    // do something with change.type and change.key
  }
}

var db;
var databaseName = 'database';
var objectStoreName = 'store1';
var req = indexedDB.open(databaseName);
req.onupgradeneeded = function() {
  db = req.result;
  db.createObjectStore(objectStoreName);
};
req.onsuccess = function() {
  db = req.result;
  var txn = db.transaction([objectStoreName], 'readwrite');
  txn.objectStore(objectStoreName).startObservingChanges(store1ObserverFunction);
  txn.oncomplete = dbOpenDone;
  txn.onerror = console.log;
};

function dbOpenDone() {
  console.log("Done!");
  // continue with your application!
}
</script>
```
