# Explainer
Documentation & FAQ of observers
**Please file an issue if you have any feedback :)**
<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**

- [Why?](#why)
- [IDBDatabase.observe(...)](#idbdatabaseobserve)
      - [`objectStores` Argument](#objectstores-argument)
      - [`options` Argument](#options-argument)
      - [Observer Function](#observer-function)
          - [`changes` Argument](#changes-argument)
          - [`records`](#records)
      - [Return Value & Lifetime](#return-value-lifetime)
      - [Example Usage](#example-usage)
- [Culling](#culling)
- [Examples](#examples)
- [Open Issues](#open-issues)
- [Feature Detection](#feature-detection)
- [FAQ](#faq)
    - [Why not expose 'old' values?](#why-not-expose-old-values)
    - [How do I know I have a true state?](#how-do-i-know-i-have-a-true-state)
    - [Why only populate the objectStore name in the `changes` records map?](#why-only-populate-the-objectstore-name-in-the-changes-records-map)
    - [Why not use ES6 Proxies?](#why-not-use-es6-proxies)
    - [Why not more like Object.observe?](#why-not-more-like-objectobserve)
    - [What realm are the change objects coming from?](#what-realm-are-the-change-objects-coming-from)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->
# Why?
IndexedDB doesn't have any observer support. This could normally be implemented by the needed website (or third party) as a wrapper around the database. However, IDB spans browsing contexts (tabs, workers, etc), and implementing a javascript wrapper that supports all of the needed features would be very difficult and performance optimization of the features would be impossible. This project aims to add IndexedDB observers as part of the specification.

Use cases for observers include:
 * Updating the UI from database changes (data binding).
 * Syncing local state from background worker (like a ServiceWorker) or another tab making changes.
 * Serializing changes for network communcation
 * Simplified application logic

# IDBDatabase.observe(...)
The function `IDBDatabase.observe(objectStores, function(changes){...}, options)` will be added.

#### `objectStores` Argument
```js
// Each store can be the string name or an object with the name and a range.
// The argument must be in array.
[ "objectStore1", { name: "objectStore2", range: IDBKeyRange.bound(0, 1000) } ] 
```

#### `options` Argument
```js
options: {
  includeValues: false,      // includes the 'value' of each change in the change array
  includeTransaction: false, // includes a readonly transaction in the observer callback
  excludeRecords: false,     // records are excluded (null)
  onlyExternal:   false      // only listen for changes from other browsing contexts
}
```

By default, the observer is only given the keys of changed items and no transaction.
 * If `includeValues` is specified, then values for all `put` and `add` will be included. However, these values can be large depending on your use of the IndexedDB.
 * If `includeTransaction` is specified, then this creates a readonly transaction for the objectstores that you're observing every time the observer function is called. This transaction provides a snapshot of the post-commit state. This does not go through the normal transaction queue, but can delay subsequent transactions on the observer's object stores. The transaction is active duing the callback, and becomes inactive at the end of the callback task or microtask.

#### Observer Function
The passed function will be called whenever a transaction is successfully completed on the given object store. If the observer is listening to multiple object stores, the function will be called once per object store change, even if they came from the same transaction (this can be changed). If a transaction doesn't make a change to the object store, then the observer is not fired.

The function will continue observing until either the database connection used to create the transaction is closed (and all pending transactions have completed), or `stop()` is called on the observer.

###### `changes` Argument
The **`changes`** argument includes the following:
```js
changes: {
  initializing: <boolean>, // If this is the initialization call for the observer.
  db: <object>, // The database connection object. If null, then the change
                // was external.
  isExternal: <boolean>, // If the changes were from a different browsing context
  transaction: <object>, // A readonly transaction over the object stores that
                         // this observer is listening to. This is populated when
                         // an observer is called for initialization, or always
                         // when includeTransaction is set in the options.
  records: Map<string, Array<object>> // The changes, outlined below.
}
```

The `db` object is the same object that was used to create the observer. If null, this means the change was external.

###### `records`
The records value in the changes object is a javascript Map of object store name to the array of change records. This allows us to include changes from multiple object stores in our callback. (Ex: you are observing object stores 'a' and 'b', and a transaction modifies both of them)

The `key` of the map is the object store name, and the `value` element of the map is a JS array, with each value containing:
 * `type`: `add`, `put`, `delete`, or `clear`
 * optional `key`: The key or IDBKeyRange for the operation (the `clear` type does not populate a key)
 * optional `value`: The value inserted into the database by `add` or `put`. Included if the `includeValues` option is specified.
Example **records** map:
```js
{'objectStore1' => [{"type":"add","key":1,"value":"val1"},
                    {"type":"add","key":2,"value":"val2"},
                    {"type":"put","key":4,"value":"val4"},
                    {"type":"delete","key":{"upperOpen":false,"lowerOpen":false,"upper":5,"lower":5}}],
 'objectStore2' => [{"type":"add","key":1,"value":"val1"},
                    {"type":"add","key":2,"value":"val2"}]}
```
These changes are culled. See the [Culling](#culling) section below.

#### Return Value & Lifetime
The return value of the `IDBDatabase.observe` fuction is the control object, which has the following functions:
```js
control: {
  stop: function(){...},   // This stops the observer permanently.
  isAlive: fuction(){...}, // This returns if the observer is alive
}
``` 
The observer is alive (and continues observing changes) until stop() is called, or the database connection is was created with is closed.

In cases like corruption, the database connection is automatically closed, and that will then close all of the observers (see Issue #9).  

#### Example Usage
```js
// ... assume 'db' is the database connection
var control = db.observe(['objectStore'], function(changes) {
    if (changes.initializing) {
      console.log('Observer is initializing.');
      // read initial database state from changes.transaction
    } else { 
      var records = changes.records.get('objectStoreName');
      console.log('Observer got change records: ', records);
    }
  });
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

Note that these operations are still ordered. They are not a disjoint set.

# Examples
See the html files for examples, hosted here:
https://dmurph.github.io/indexed-db-observers/ 

# Open Issues
Issues section here: https://github.com/dmurph/indexed-db-observers/issues

# Feature Detection
For future feature detection, I've included the following special case for calling `IDBDatabase.observe()` with no arguments:

```js
var features = db.observe(); // no arg call
if (!features.includeTransaction || !features.includeValues) {
  // etc
}
```

This returns a js object that includes the options that are supported. By default this is:
```js
{
  includeValues: true,
  includeTransaction: true,
  excludeRecords: true,
  onlyExternal: true
};
```

Any suggestions for better ways to do this is appreciated, I can't find any normal way to do this.

# FAQ
### Why not expose 'old' values?
IndexedDB was designed to allow range delete optimizations so that `delete [0,10000]` doesn't actually have to physically remove those items to return. Instead we can store range delete metadata to shortcut these operations when it makes sense. Since we have many assumptions for this baked our abstraction layer, getting an 'original' or 'old' value would be nontrivial and incur more overhead.

### How do I know I have a true state?
One might need to guarentee that their observer can see a true, consistant state of the world. This is accomplished by specifying the `includeTransaction` option. This means that every observation callback will receive a readonly transaction for the object store/s that it is observing. It can then use this transaction to see the true state of the world. This transaction will take place immediately after the transaction in which the given changes were performed is completed.

### Why only populate the objectStore name in the `changes` records map?
Object store objects are only valid when retrieved from transactions. The only relevant information of that object outside of the transaction is the name of the object store. Since the transaction is optional for the observation callback, we aren't guaranteed to be able to create the IDBObjectStore object for the observer.  However, it is easy for the observer to retrieve this object by
 1. Specifying `includeTransaction` in the options map
 2. calling changes.transaction.objectStore(name)

### Why not use ES6 Proxies?
The two main reasons are:
 1. We need to observe changes across browsing contexts. Passing a proxy across browsing contexts in not possible, and it's infeasible to have every browsing context create a proxy and give it to everyone else (n*n total proxies).
 2. Changes are committed on a per-transaction basis, and can include changes to multiple object stores. We can encompass this is an easy way when we control the observation function, where this would require specialized and complex logic by the client if it was proxy-based.

### Why not more like Object.observe?
 1. We need to include a lot more metadata, like transactions.
 2. We need to include changes from multiple object stores for a single callback.
 3. We can't include the 'old' values.
 4. Operation type conflicts:  'put' vs 'update'

### What realm are the change objects coming from?
All changes (the keys and values) are structured cloneable, and are cloned from IDB. So they are not coming from a different realm.
