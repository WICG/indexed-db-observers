<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**

- [indexed-db-observers](#indexed-db-observers)
- [Polyfill](#polyfill)
- [Usage](#usage)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

# indexed-db-observers
Prototyping and discussion around IndexedDB observers.

 * [Explainer & FAQ](EXPLAINER.md) **<-- read this for details & spec changes**
 * [Examples](https://dmurph.github.io/indexed-db-observers/)

# Polyfill
The polyfill is located here:
```html
<script src="//dmurph.github.io/indexed-db-observers/polyfill.js"></script>
```

**It is currently out of date, as the spec has been changing a bit. I'll update it when the spec has settled.**

**PLEASE SEE EXPLAINER.MD FOR UP-TO-DATE INFORMATION**

Caveats:
 * It doesn't broadcast changes across browsing contexts.
 * Not very memory efficient.

# Usage
The function `IDBTransaction.observe(function(changes){...}, options)` will be added.

You can drop this into your web page right now (with small customization) and it should work:
```html
<script src="//dmurph.github.io/indexed-db-observers/polyfill.js"></script>
<script>
// ##### START BOILERPLATE ######
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
  main();
}
// ##### END BOILERPLATE ######

var control;
function main() {
  var txn = db.transaction([objectStoreName], 'readonly'];
  control = txn.observe(observerFunction);
  txn.oncomplete = function() {
    console.log('Observing is starting!');
  }
}

function observerFunction(changes) {
  console.log('Observer received changes!');
  // An object store that we're observing has changed.
  changes.records.forEach(function(records, objectStoreName) {
    console.log('Got changes for object store: ', objectStoreName);
    records.forEach(function(change) {
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
  });
}
</script>
```

Here we ask for a readonly transaction in our changes:
```js
var control = txn.observe(function(changes) {
  var objectStore = changes.transaction.objectStore('store1');
  // read in values, etc
}, { includeTransaction: true });
```

Here we ask for the values in our changes:
```js
var control = txn.observe(function(changes) {
  changes.records.get(objectStoreName).forEach(function(change) {
    var type = change.type;
    switch (type) {
      case 'add':
        console.log('value "', change.value, '" added with key "', change.key, '"');
        break;
    }
  });
}, { includeValues: true });
```

And when we're done...
```js
control.stop();
```

See the [explainer](EXPLAINER.md) for more info, and the [examples](https://dmurph.github.io/indexed-db-observers/) for hosted examples. The demo app is especially helpful, as it visualizes everything for you.
