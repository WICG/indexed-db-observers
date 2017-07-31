# Explainer
Documentation & FAQ of observers. See accompanying WebIDL file [IDBObservers.webidl](/IDBObservers.webidl)

**Please file an issue if you have any feedback :)**

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**

- [Why?](#why)
- [Example Uses](#example-uses)
- [interface IDBObserver](#interface-idbobserver)
  - [new IDBObserver(callback)](#new-idbobservercallback)
  - [IDBObserver's observe(...)](#idbobservers-observe)
    - [`options` Argument](#options-argument)
  - [IDBObserver's unobserve(database)](#idbobservers-unobservedatabase)
  - [Callback Function](#callback-function)
    - [`changes` Argument](#changes-argument)
    - [`records`](#records)
  - [Lifetime](#lifetime)
- [Observation Consistency & Guarantees](#observation-consistency--guarantees)
  - [Transaction Ordering (Edge Case)](#transaction-ordering-edge-case)
- [Examples (old)](#examples-old)
- [Open Issues](#open-issues)
- [Feature Detection](#feature-detection)
- [Spec changes](#spec-changes)
- [Future Features](#future-features)
  - [Coalescing](#Coalescing)
- [FAQ](#faq)
    - [Why require `db` and not just `transaction` in `IDBObserver.observe`](#why-require-db-and-not-just-transaction-in-idbobserverobserve)
    - [Observing onUpgrade](#observing-onupgrade)
    - [Why not expose 'old' values?](#why-not-expose-old-values)
    - [Why not issue 'deletes' instead a 'clear'?](#why-not-issue-deletes-instead-a-clear)
    - [What is a true/consistent state?](#what-is-a-trueconsistent-state)
    - [How do I know I have a true state?](#how-do-i-know-i-have-a-true-or-consistent-state)
    - [Why only populate the objectStore name in the `changes` records map?](#why-only-populate-the-objectstore-name-in-the-changes-records-map)
    - [Why not use ES6 Proxies?](#why-not-use-es6-proxies)
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

See [the EXAMPLES.md doc](/EXAMPLES.md) for more examples.

If we just want to know when an object store has changed. This isn't the most efficient, but this might be the 'starting block' websites use to transition to observers, as at some point they would read the database using a transaction to update their UI.
 
```javascript
// We just grab the transaction and give it to our UI refresh logic.
var refreshDataCallback = function(changes) {
  refreshDataWithTransaction(changes.transaction);
}
// We disable records, so we just get the callback without any data.
// We ask for the transaction, which guarentees we're reading the current
// state of the database and we won't miss any changes.
var observer = new IDBObserver(refreshDataCallback);
observer.observe(
    db, db.transact('users', 'readonly'),
    { noRecords: true, transaction: true, operations: ['add', 'put', 'delete', 'clear'] });
```

# interface IDBObserver
The interface [`IDBObserver`](/IDBObservers.webidl) is added. This object owns the callback of the observer. We then use this object to observe databases (or targets), similar to IntersectionObserver and MutationObserver.

## new IDBObserver(callback)
This creates the observer object with the callback. All observations initated with this object will use the given callback.

## IDBObserver's observe(...)
The function [`IDBObserver.observe(database, transaction, options)`](/IDBObservers.webidl) is added.

This function starts observation on the target database connection using the given transaction. We start observing the object stores that the given transaction is operating on (the object stores returned by `IDBTransaction.objectStoreNames`). Observation will start at the end of the given transaction, and the observer's callback function will be called at the end of every transaction that operates on the chosen object stores until either the database connection is closed or `IDBObserver.unobserve` is called with the target database.

The transaction CANNOT be an upgrade transaction.

See [Exceptions](#exceptions).

**The `options` argument - with the `operations` populated - is required**

### `options` Argument

**`operations`** - required.

Lists the operations that the observer wants to see. This cannot be empty. Accepted values are `put`, `add`, `delete`, and `clear`.

**`includeTransaction`** - optional

A transaction with a new mode - `snapshot` - and a scope of the object stores being observered is always included in the changes argument. This transaction is read-only, and provides a snapshot of the post-commit state. This does not go through the normal transaction queue, but can delay subsequent transactions on the observer's object stores. The transaction is active during the callback, and becomes inactive at the end of the callback task or microtask. *Note: This transaction CANNOT be used for another observe call.*

**`onlyExternal`** - optional

Only changes from other database connections will be observed. This can be another connection on the same page, or a connection from a different browsing context (background worker, tab, etc).

**`includeValues`** - optional

Values for all `put` and `add` will be included for the resptive object stores. However, **these values can be large depending on your use of the IndexedDB, so use cautiously.**

**`excludeRecords`** - optional

Changes will never contain a records map. This is the most lightweight option having an observer.

**`ranges` map** - optional

Specifies the exact IDBKeyRanges to observe, per object store. Changes outside of these ranges will not trigger an observe callback.

## IDBObserver's unobserve(database)
This stops observation of the given target database connection. This will stop all `observe` registrations to the given database connection. An exception is thrown if we aren't observing that connection (see [Exceptions](#exceptions))

## Callback Function
The observer callback function will be called whenever a transaction is successfully completed on the applicable object store/s. There is one observer callback per applicable transaction.

The observer functionality starts after the the transaction the observer was created in is completed. This allows the creator to read the 'true' state of the world before the observer starts. In other words, this allows the developer to control exactly when the observing begins.

The function will continue observing until either the database connection used to create the transaction is closed (and all pending transactions have completed), or `stop()` is called on the observer.

### `changes` Argument
The **`changes`** argument includes the following:
```js
changes: {
  db: <object>, // The database connection object. If null, then the change
                // was from a different database connection.
  transaction: <object>, // A 'snapshot' transaction over the object stores that
                         // this observer is listening to. This is populated when
                         // 'transaction' is set in the options.
  records: record<DOMString, sequence<object>> // The changes per object store, outlined below.
}
```
(see [IDBObservers.webidl](IDBObservers.webidl))

### `records`
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

## Lifetime
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

## Transaction Ordering (Edge Case)

We require that the transaction given to the observer callback is over ALL object stores observed, even if the change is to a subset. This means we can hit the following scenario:

1. Transaction A creates observer O stores X and Y.
2. Transaction B writes to store X.
3. Transaction C writes to store Y.

The spec requires that the observer is called for both the B and C changes separately with the ability to have a readonly transaction for X and Y. When this happens can depend on the implementation.

1. If the we have strict exclusive locks for writing, then creating observer O would merge the X and Y locks (as we always need to create a readonly transaction if any of the stores get modified on all of the object stores). O would be called after step 2 w/ B's changes while transcation C waits until AFTER the observer's transaction finishes.
2. If the implementation allows database snapshots, then O can receive the readonly transaction while C executes, as the transaction for B's changes could take a snapshot of the database before C's changes.
  i. Caveat - we wouldn't want another transaction after C to acquire a X or Y exclusive lock while O's transaction from B is still executing, as this could allow stale transactions to stick around.

# Examples (old)
See the html files for examples, hosted here:
https://dmurph.github.io/indexed-db-observers/

# Open Issues
Issues section here: https://github.com/WICG/indexed-db-observers/issues

# Feature Detection
For new features like coalescing, we don't have a good way for feature detection. Hopefully [heycam/webidl#107](https://github.com/heycam/webidl/issues/107) will pan out - that looks like it would work for this as well.

# Spec Changes
See [the SPEC_CHANGES.md document](/SPEC_CHANGES.md) for informal notes about the spec changes for this feature.

# Future Features

## Coalescing
The changes given to the observer could be coalesced. This eliminated changes that are overwritten in the same transaction or redundant. Here are some examples:

 1. add 'a', 1
 2. add 'b', 2
 3. put 'putA', 1
 4. delete 2

These changes can **coalesced** to simply be

 1. add 'putA', 1

In addition, deletes are combined when applicable:

 1. delete [0, 5]
 2. put '1' 1
 3. put '6' 6
 4. delete [5, 6)
 5. delete [6, 7)

This is coalesced to:

 1. delete [0, 7)
 2. put '1' 1

Note that these operations are still ordered. They are not a disjoint set.

This could be an boolean option in the IDBObserverDataStoreOptions object, `coalescing`.


# FAQ
## Why require `db` and not just `transaction` in `IDBObserver.observe`?
This was done to maintain consistancy with other web platform observer features, like [MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver) or [IntersectionObserver](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API). The idea is that the first argument to `observe` will be tied to the lifetime of the observer object, where the target has a refptr to the observer and keeps it alive.

### Observing onUpgrade
This spec does not offer a way to observe during onupgrade. Potential clients voiced they wouldn't need this feature. This doesn't seem like it's needed either, as one can just read in any data they need with the transaction used to do the upgrading.  Then the observer is guarenteed to begin at the end of that transaction (if one is added), and it wouldn't miss any chanage.

### Why not expose 'old' values?
IndexedDB was designed to allow range delete optimizations so that `delete [0,10000]` doesn't actually have to physically remove those items to return. Instead we can store range delete metadata to shortcut these operations when it makes sense. Since we have many assumptions for this baked our abstraction layer, getting an 'original' or 'old' value would be nontrivial and incur more overhead.

### Why not issue 'deletes' instead a 'clear'?
Following from the answer above, IndexedDB's API is designed to allow mass deletion optimization, and in order to have the 'deletes instead of clear' functionality, this would involve expensive read operations within the database.  If an observer needed to know exactly what was deleted, they can maintain their own state of the keys that they care about.

### What is a true/consistent state?
This is an important concept, and is the reason a lot of the API is the way it is.

* the spec needs to guarantee you can NOT miss any changes if you wish to do so
* the spec needs to guarantee you can NOT see duplicate changes
* if the observer only wants keys, the spec needs to provide a way to read the values or the whole world state at the time of the change, and NOT include any changes afterwards.

### How do I know I have a true or consistent state?
To achieve an initial world state, one would use the transaction that is used to create the observer to read in all of the initial values that they care about. Then all changes after this transaction is committed are guarenteed to be reported to the observer without duplicates.

Another tool is the `includeTransaction` option which can be used to read in an unchanging state of the world during the observer callback. This transaction will take place immediately after the transaction in which the given changes were performed is completed.

### Why only populate the objectStore name in the `changes` records map?
Object store objects are only valid when retrieved from transactions. The only relevant information of that object outside of the transaction is the name of the object store. Since the transaction is optional for the observation callback, we aren't guaranteed to be able to create the IDBObjectStore object for the observer.  However, it is easy for the observer to retrieve this object by
 1. Specifying `transaction` in the options map
 2. calling changes.transaction.objectStore(name)

### Why are changes in a map instead of a flat list?
This is done to avoid data duplication of the object store name. This can be changed. Cons of the current approach:
* Impossible to determine the full ordering of transaction operations across object stores.
* Two layers to get to information, slightly more complex.

See Issue #49.

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
