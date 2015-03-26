

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
  if (changes) { 
    console.log("Observer received changes for object store '" + metadata.objectStoreName + "': " + JSON.stringify(changes));
    // An object store that we're observing has changed.
    changes.forEach(function(change) {
      // do something with change.type and change.key
    });
  } else {
    console.log('Observer is initializing.');
    // read initial database state from metadata.transaction
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

# Resources

 * [Explainer & FAQ](explainer.md)
 * [Examples](https://dmurph.github.io/indexed-db-observers/)
