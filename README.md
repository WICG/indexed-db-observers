# indexed-db-observers
Prototyping and discussion around indexeddb observers.

 * [Explainer & FAQ](EXPLAINER.md)
 * [Examples](https://dmurph.github.io/indexed-db-observers/)

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

You can drop this into your webpage right now (with small customization) and it should work:
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
  control = db.observe([objectStoreName], observerFunction);
}

function observerFunction(changes) {
  if (changes.initializing) {
    console.log('Observer is initializing.');
    // read initial database state from changes.transaction
    
  } else { 
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
}
</script>
```
Here we ask for a readonly transaction in our changes:
```js
var control = db.observe([objectStoreName], function(changes) {
  if (changes.initializing) {
    console.log('Observer is initializing.');
    // read initial database state from metadata.transaction
  } else { 
    var objectStore = changes.transaction.objectStore('store1');
    // read in values, etc
  }
}, { includeTransaction: true });
```

Here we ask for the values in our changes:
```js
var control = db.observe([objectStoreName], function(changes) {
  if (changes.initializing) {
    console.log('Observer is initializing.');
    // read initial database state from metadata.transaction
  } else { 
    changes.records.get(objectStoreName).forEach(function(change) {
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

And when we're done...
```js
control.stop();
```

See the [explainer](EXPLAINER.md) for more info, and the [examples](https://dmurph.github.io/indexed-db-observers/) for hosted examples.  The demo app is especially helpful, as it visualizes everything for you.
