# Explainer
Documentation & FAQ of observers
**Please file an issue if you have any feedback :)**

**NOTE: THIS DOCUMENTATION IS MORE UP TO DATE THAN THE POLYFILL/EXAMPLES**

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**

- [Why?](#why)
- [IDBTransaction.observe(...)](#idbtransactionobserve)
      - [`options` Argument](#options-argument)
      - [Observer Function](#observer-function)
          - [`changes` Argument](#changes-argument)
          - [`records`](#records)
      - [Return Value & Lifetime](#return-value-&-lifetime)
      - [Example Usage](#example-usage)
- [Observation Consistency & Guarantees](#observation-consistency-&-guarantees)
- [Other Versions](#other-versions)
  - [Event Version](#event-version)
- [Culling](#culling)
- [Examples](#examples)
- [Open Issues](#open-issues)
- [Feature Detection](#feature-detection)
- [IDBDatabase.observe(...)](#idbdatabaseobserve)
- [FAQ](#faq)
    - [Why not expose 'old' values?](#why-not-expose-old-values)
    - [Why not issue 'deletes' instead a 'clear'?](#why-not-issue-deletes-instead-a-clear)
    - [How do I know I have a true state?](#how-do-i-know-i-have-a-true-state)
    - [Why only populate the objectStore name in the `changes` records map?](#why-only-populate-the-objectstore-name-in-the-changes-records-map)
    - [Why not use ES6 Proxies?](#why-not-use-es6-proxies)
    - [Why not more like Object.observe?](#why-not-more-like-objectobserve)
    - [What realm are the change objects coming from?](#what-realm-are-the-change-objects-coming-from)
    - [Why not observe from ObjectStore object?](#why-not-observe-from-objectstore-object)
- [Spec changes](#spec-changes)
  - [Observer Creation](#observer-creation)
  - [Observer Control](#observer-control)
  - [Change Recording](#change-recording)
    - [Add Operation](#add-operation)
    - [Put Operation](#put-operation)
    - [Delete Operation](#delete-operation)
  - [Observer calling](#observer-calling)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->
# Why?
IndexedDB doesn't have any observer support. This could normally be implemented by the needed website (or third party) as a wrapper around the database. However, IDB spans browsing contexts (tabs, workers, etc), and implementing a javascript wrapper that supports all of the needed features would be very difficult and performance optimization of the features would be impossible. This project aims to add IndexedDB observers as part of the specification.

Use cases for observers include:
 * Updating the UI from database changes (data binding).
 * Syncing local state from background worker (like a ServiceWorker) or another tab making changes.
 * Serializing changes for network communication
 * Simplified application logic

# IDBTransaction.observe(...)
The function `IDBTransaction.observe(function(changes){...}, options)` will be added.

This function causes an observer to be created for the object stores that the given transaction is operating on. The returned object is a 'control' object which can be used to stop the observer. The given function will be called at the end of every transaction that operates on the chosen object stores until either the database connection is closed or 'stop' is called on the control object.

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
 * If `includeTransaction` is specified, then this creates a readonly transaction for the objectstores that you're observing every time the observer function is called. This transaction provides a snapshot of the post-commit state. This does not go through the normal transaction queue, but can delay subsequent transactions on the observer's object stores. The transaction is active during the callback, and becomes inactive at the end of the callback task or microtask.

#### Observer Function
The observer function will begin being called when the transaction it is created from is completed. This allows the creator to read the 'true' state of the world before the observer starts. In other words, this allows the developer to control exactly when the observing begins.

The passed function will be called whenever a transaction is successfully completed on the given object store/s. The changes given to the function will be the 'culled' changes of each transaction. There is one observer callback per applicable transaction.

The function will continue observing until either the database connection used to create the transaction is closed (and all pending transactions have completed), or `stop()` is called on the observer.

###### `changes` Argument
The **`changes`** argument includes the following:
```js
changes: {
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
The return value of the `IDBDatabase.observe` function is the control object, which has the following functions:
```js
control: {
  stop: function(){...},   // This stops the observer permanently.
  isAlive: function(){...}, // This returns if the observer is alive
}
```
The observer is alive (and continues observing changes) until stop() is called, or the database connection is was created with is closed.

In cases like corruption, the database connection is automatically closed, and that will then close all of the observers (see Issue #9).

#### Example Usage
```js
// ... assume 'db' is the database connection
var txn = db.transaction(['objectStore'], 'readonly');
var control = txn.observe(function(changes) {
  if (changes.initializing) {
    console.log('Observer is initializing.');
    // read initial database state from changes.transaction
    return;
  }
  var records = changes.records.get('objectStore');
  console.log('Observer got change records: ', records);
});
```

# Observation Consistency & Guarantees
To give the observer strong consistency of the world that it is observing, we need to allow it to
 1. Know the contents of the observing object stores before observation starts (after which all changes will be sent to the observer)
 2. Read the observing object stores at each change observation.

We accomplish #1 by incorporating a transaction into the creation of the observer. After this transaction completes (and has read anything that the observer needs to know), all subsequent changes to the observing object stores will be sent to the observer.

For #2, we optionally allow the observer to
 1. Include the values of the changed keys.  Since we know the initial state, with the keys & values of all changes we can maintain a consistent state of the object stores.
 2. Include a readonly transaction of the observing object stores.  This transaction is scheduled right after the transaction that made these changes, so the object store will be consistent with the 'post observe' world.

# Other Versions
These are other options for the API based on conversations.

## Event Version
We can move to an event version of this based on Mozilla's model here:
https://bugzilla.mozilla.org/show_bug.cgi?id=1059724#c1

This would result in the following version of the example code, where the 'changes' argument has changed to an event:
```js
// ... assume 'db' is the database connection
var observer = db.observe(['objectStore']);
observer.onchange = function(event) {
  if (event.initializing) {
    console.log('Observer is initializing.');
    // read initial database state from changes.transaction
    return;
  }
  var records = changes.records.get('objectStore');
  console.log('Observer got change records: ', records);
};
```

The `stop()` and `isAlive()` functions would still live on this observer object.

Pros:
 * The event pattern is more common to the web platform.

Cons:
 * This adds one extra line of code.
 * This is seen as an old style that is out of date.

# Culling
The changes given to the observer are culled. This eliminated changes that are overwritten in the same transaction or redundant. Here are some examples:
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

# IDBDatabase.observe(...)
Since creating an observer inside of a transaction is confusing to some users, and sometimes people don't need to do any reading for their observer, a shortcut method can be made on the database that just creates an empty transaction with the given object stores, and then adds the observer.

# FAQ
### Why not expose 'old' values?
IndexedDB was designed to allow range delete optimizations so that `delete [0,10000]` doesn't actually have to physically remove those items to return. Instead we can store range delete metadata to shortcut these operations when it makes sense. Since we have many assumptions for this baked our abstraction layer, getting an 'original' or 'old' value would be nontrivial and incur more overhead.

### Why not issue 'deletes' instead a 'clear'?
Following from the answer above, IndexedDB's API is designed to allow mass deletion optimization, and in order to have the 'deletes instead of clear' functionality, this would involve expensive read operations within the database.  If an observer needed to know exactly what was deleted, they can maintain their own state of the keys that they care about.

### How do I know I have a true state?
One might need to guarantee that their observer can see a true, consistent state of the world. This is accomplished by specifying the `includeTransaction` option. This means that every observation callback will receive a readonly transaction for the object store/s that it is observing. It can then use this transaction to see the true state of the world. This transaction will take place immediately after the transaction in which the given changes were performed is completed.

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

# Spec changes
These are the approximate spec changes that would happen:

## Observer Creation
When the observe method is called on a transaction, the given options, callback, and the transaction's object stores are given a unique id and are stored in a `pending_observer_construction` list as an `Observer`.  This id is given to the observer control, which is returned. When the transaction is completed successfuly, the Observer is added to the domain-specific list of observers.  If the transaction is not completed successfuly, this does not happen.

## Observer Control
When `isAlive()` is called on the observer control, it looks in the domain-specific list of observers to find the observer with it's uuid.  If that observer does not exist, then it returns false.

When `stop()` is called on the control, the observer with the control's uuid is removed from the domain-specific observer list

## Change Recording
Whenever a change succeeds in a transaction, it adds it to a `culled_change_list` in the following manner:

### Add Operation
Append the add operation, key and value, on end of operations list.

### Put Operation
1. Iterate backwards in the `culled_change_list` and look for any 'add', 'put' or 'delete' change with an **intersecting key**.
2. If a put is reached, delete that entry from the list.
3. If an add is reached, replace the value of the add with the new put value and return.
4. If a delete is reached, then append the new put at the end of operations and return.
5. If the end of the list is reached, then append the new put at the end of operations and return.

### Delete Operation
1. Iterate backwards in the `culled_change_list` and look for any 'add', 'put' or 'delete' change with an **intersecting key**.
2. If a put is reached, delete that entry from the list.
3. If an add is reached, delete that entry from the list.
4. If a delete is reached, modify the reached delete to be a union of it's current range and the new delete range.
5. If we reach the end of the operations list and the new delete was never combined with an older delete, append the delete to the list of operations.

## Observer calling
When a transaction successfully completes, send the `culled_change_list` changes to all observers that have objects stores touched by the completed transaction. When sending the changes to each observer, all changes to objects stores not observed by the observer are filtered out.
