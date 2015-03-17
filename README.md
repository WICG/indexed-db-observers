# indexed-db-observers
Prototyping and discussion around indexeddb observers.
Please file an issue if you have any feedback :)
<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [Objective](#objective)
- [IDBDatabase.observe(objectStores, fcn(changes, metadata){}, options)](#idbdatabaseobserveobjectstores-fcnchanges-metadata-options)
      - [Example usage:](#example-usage)
      - [objectStores argument:](#objectstores-argument)
      - [options argument:](#options-argument)
      - [Observer function](#observer-function)
      - [Return value](#return-value)
- [Culling](#culling)
- [Examples](#examples)
- [Open Issues](#open-issues)
    - [Having changes from multiple object stores in one callback.](#having-changes-from-multiple-object-stores-in-one-callback)
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

# IDBDatabase.observe(objectStores, fcn(changes, metadata){}, options)
#### Example Usage
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
#### `objectStores` Argument
```
"objectStore1"
or
{ name: "objectStore1", range: IDBKeyRange.only(3) }
or
[ "objectStore1", { name: "objectStore2", range: IDBKeyRange.only(3) } ] 
```

#### `options` Argument
```
options: {
  includeValues: false,      // includes the 'value' of each change in the change array
  includeTransaction: false  // includes a readonly transaction in the observer callback
}
```

#### Observer Function
The passed function will be called whenever a transaction is successfully completed on the given object store. If the observer is listening to multiple object stores, the function will be called once per object store change.
###### `changes` Argument
The **`changes`** argument is a JS array, with each value containing:
 * `type`: `add`, `put`, `delete`, or `clear`
 * `key`: The key or IDBKeyRange for the operation
 * optional `value`: The value inserted into the database by `add` or `put`.  Included if the `includeValues` option is specified.
Example **changes** array:
```
[{"type":"add","key":1,"value":"val1"},
 {"type":"add","key":2,"value":"val2"},
 {"type":"put","key":4,"value":"val4"},
 {"type":"delete","key":{"upperOpen":false,"lowerOpen":false,"upper":5,"lower":5}}]
```
These changes are culled.  See the [Culling](#culling) section below.

###### `metadata` Argument
The `metadata` includes the following:
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

#### Return Value
The return value of the `IDBDatabase.observe` fuction is the observer object, which has the following functions:
```
observer: {
  stop: function(){...},   // This stops the observer permanently.
  isAlive: fuction(){...}, // This returns if the observer is alive.
}
```

# Culling
The changes given to the observer are culled. This eliminated changes that are overwriten in the same transaction or redundant. Here are some examples:
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

# Examples
See the html files for examples, hosted here:
https://dmurph.github.io/indexed-db-observers/ 

# Open Issues
### Having changes from multiple object stores in one callback.
If a transaction hits multiple object stores, and an observer is registered for more than one of the ones modified in the transaction, should we include all of those changes in that observer function?  I'm thinking probably yes.  Also, if the observer is asking for transactions this means we are creating multiple transactions for the change, instead of just one.
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
