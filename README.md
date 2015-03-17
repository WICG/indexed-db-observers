# indexed-db-observers
Prototyping and discussion around indexeddb observers.
Please file an issue if you have any feedback :)
<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**

- [Objective](#objective)
- [API Additions](#api-additions)
    - [IDBDatabase.observe(objectStores, fcn(changes, metadata){}, options)](#idbdatabaseobserveobjectstores-fcnchanges-metadata-options)
- [Examples](#examples)
- [Open Issues](#open-issues)
    - [Having changes from multiple object stores in one callback.](#having-changes-from-multiple-object-stores-in-one-callback)
    - [Representation of `changes` given to observer](#representation-of-changes-given-to-observer)
- [FAQ](#faq)
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
### IDBDatabase.observe(objectStores, fcn(changes, metadata){}, options)
###### Example usage:
```
function observerFunction(changes, metadata) {
  if (changes) { 
    console.log("Observer received changes for object store '" + metadata.objectStoreName + "': ",
                JSON.stringify(changes));
    // An object store that we're observing has changed.
    for (var i = 0; i < changes.length; i++) {
      var change = changes[i];
      // do something with change.type and change.key
    }
  } else {
    console.log('Observer is initializing.');
    // read initial database state from metadata.transaction
  }
}

// ... assume 'db' is the database connection
var observer = db.observe(['objectStore'], observerFunction);
// ... later, observer.stop(); stops the observer.
```
###### objectStores argument:
```
"objectStore1"
or
{ name: "objectStore1", range: IDBKeyRange.only(3) }
or
[ "objectStore1", { name: "objectStore2", range: IDBKeyRange.only(3) } ] 
```

###### options argument:
```
options: {
  includeValues: false,      // includes the 'value' of each change in the change array
  includeTransaction: false  // includes a readonly transaction in the observer callback
}
```

###### Observer function
The passed function will be called whenever a transaction is successfully completed on the given object store. If the observer is listening to multiple object stores, the function will be called once per object store change.  The **`changes`** argument is a JS array, with each value containing:
 * `type`: `add`, `put`, `delete`, or `clear`
 * `key`: The key or IDBKeyRange for the operation
 * optional `value`: The value inserted into the database by `add` or `put`.  Included if the `includeValues` option is specified.
Example **changes** array:
```
[{"type":"add","key":1,"value":"val1"},
 {"type":"add","key":2,"value":"val2"},
 {"type":"put","key":4,"value":"val4"},
 {"type":"delete","key":{"upperOpen":false,"lowerOpen":false,"upper":2,"lower":0}}]
```

The **`metadata`** includes the following:
```
metadata: {
  db: <object>, // The database connection object
  objectStoreName: <string>, // The name of the object store that was changed
  isExternalChange: <t/f>, // If the change came from a different browsing context
  transaction: <object>  // A readonly transaction over the object stores that
                         // this observer is listening to. This is populated when
                         // an observer is called for initialization, or always
                         // when includeTransaction is set in the options.
}
```
The function will continue observing until either the database connection used to create the transaction is closed (and all pending transactions have completed), or `stop()` is called on the observer.

###### Return value
The return value of this fuction is the observer object, which has the following functions:
```
observer: {
  stop: function(){}, // This stops the observer permanently.
  isAlive: fuction(){}, // This returns if the observer is alive.
}
```

# Examples
See the html files for examples, hosted here:
https://dmurph.github.io/indexed-db-observers/ 

# Open Issues
### Having changes from multiple object stores in one callback.
If a transaction hits multiple object stores, and an observer is registered for more than one of the ones modified in the transaction, should we include all of those changes in that observer function?  I'm thinking probably yes.  Also, if the observer is asking for transactions this means we are creating multiple transactions for the change, instead of just one.

### Representation of `changes` given to observer
(old, we're probably going with culling)

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

### Why not expose 'old' values?
IndexedDB was designed to allow range delete optimizations so that `delete [0,10000]` doesn't actually have to physically remove those items to return.  Instead we can store range delete metadata to shortcut these operations when it makes sense.  Since we have many assumptions for this baked our abstraction layer, getting an 'original' or 'old' value would be nontrivial and incur more overhead.

# Try it out!
Import the polyfill to try it out:
```
<script src="//dmurph.github.io/indexed-db-observers/polyfill.js"></script>
```
Polyfill Caveats:
 * It doesn't broadcast accross browsing contexts
 * No culling of changes yet

Here is a quick start that you can paste:
``` 
<script src="//dmurph.github.io/indexed-db-observers/polyfill.js"></script>
<script>
function observerFunction(changes, metadata) {
  if (changes) { 
    console.log("Observer received changes for object store '" + metadata.objectStoreName + "': " + JSON.stringify(changes));
    // An object store that we're observing has changed.
    for (var i = 0; i < changes.length; i++) {
      var change = changes[i];
      // do something with change.type and change.key
    }
  } else {
    console.log('Observer is initializing.');
    // read initial database state from metadata.transaction
  }
}

var db;
var databaseName = 'database';
var objectStoreName = 'store1';
var observer;
var req = indexedDB.open(databaseName);
req.onupgradeneeded = function() {
  db = req.result;
  db.createObjectStore(objectStoreName);
};
req.onsuccess = function() {
  db = req.result;
  observer = db.observe([objectStoreName], observerFunction);
};

</script>
```
