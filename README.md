

# indexed-db-observers
Prototyping and discussion around indexeddb observers.
**Please file an issue if you have any feedback :)**
<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**
- [Objective](#objective)
- [Polyfill](#polyfill)
- [Usage](#usage)
- [Resources](#resources)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->
# Objective
IndexedDB doesn't have any observer support.  This could normally be implemented by the user agent as a wrapper around the database. However, IDB spans browsing contexts (tabs, workers, etc), and implementing a javascript wrapper that supports all of the needed features would be very difficult and performance optimization of the features would be impossible.  This project aims to add IndexedDB observers as part of the specification.

Here are some use cases of observers:
 * Updating the UI from database changes (data binding).
 * Syncing local state from background worker (like a ServiceWorker) or another tab making changes.
 * Serializing changes for network communcation

# Polyfill
The polyfill is located here:
```html
<script src="//dmurph.github.io/indexed-db-observers/polyfill.js"></script>
```

Caveats:
 * It doesn't broadcast changes accross browsing contexts.
 * Not very memory efficient.

# Usage
The function `IDBDatabase.observe(objectStores, function(changes, metadata){...}, options)` will be added.

```html
<script src="//dmurph.github.io/indexed-db-observers/polyfill.js"></script>
<script>
function observerFunction(changes, metadata) {
  if (!changes) {
    console.log('Observer is initializing.');
    // read initial database state from metadata.transaction
    
  } else { 
    console.log('Observer received changes for object store ', metadata.objectStoreName);
    // An object store that we're observing has changed.
    changes.forEach(function(change) {
      console.log('Got change: ', change);
      // do something with change.type and change.key
      var type = change.type;
      switch (type) {
        case 'clear':
          console.log('object store cleared.');
          break;
        case 'add':
          console.log('key "', change.key, '" added.');
          break;
        case 'put':
          console.log('key "', change.key, '" putted.');
          break;
        case 'delete':
          console.log('key or range "', change.key, '" deleted.');
          break;
      }
    });
  }
}

var db;
var databaseName = 'database';
var objectStoreName = 'store1';
var control;
var req = indexedDB.open(databaseName);
req.onupgradeneeded = function() {
  db = req.result;
  db.createObjectStore(objectStoreName);
};
req.onsuccess = function() {
  db = req.result;
  control = db.observe([objectStoreName], observerFunction);
};

</script>
```
Here we ask for a readonly transaction in our changes:
```js
var control = db.observe([objectStoreName], function(changes, metadata) {
  if (!changes) {
    console.log('Observer is initializing.');
    // read initial database state from metadata.transaction
  } else { 
    var objectStore = metadata.transaction.objectStore('store1);
    // read in values, etc
  }
}, { includeTransaction: true });
```

Here we ask for the values in our changes:
```js
var control = db.observe([objectStoreName], function(changes, metadata) {
  if (!changes) {
    console.log('Observer is initializing.');
    // read initial database state from metadata.transaction
  } else { 
    changes.forEach(function(change) {
      var type = change.type;
      switch (type) {
        case 'add':
          console.log('value "', change.value, '" added with key "', change.key, '"');
          break;
      }
    });
  }
}, { includeValues: true });
```
# Resources

 * [Explainer & FAQ](explainer.md)
 * [Examples](https://dmurph.github.io/indexed-db-observers/)
