# indexed-db-observers
Prototyping and discussion around indexeddb observers.
Please file an issue if you have any feedback :)

## Objective
IndexedDB needs a way to observe changes.  This project is for exploring API changes to make this possible.  Everything here is up for discussion.

## Basic Usage
Import the polyfill:
```
<script src="https://dmurph.github.io/indexed-db-observers/indexed-db-observers-polyfill.js"></script>
```
Create your database like normal, and then add your observer:
```
var txn = db.transaction(['objectStore'], 'readwrite');
txn.objectStore('objectStore').startObservingChanges(function(changes) {
  console.("Observer received changes: <br/>&nbsp;&nbsp;" + JSON.stringify(changes));
});
```
## API Additions
These are the following additions to the IndexedDB API:
### IDBObjectStore.prototype.startObservingChanges(function(changes))
The given function will be called whenever a transaction is successfully completed on the given object store.  The `changes` argument takes the following structure:
 * type: 'add', 'put', or 'delete'
 * key: The key or key range of the operation

The function will continue observing until either the database connection used to create the transaction is closed (and all pending transactions have completed), or `stopObservingChanges` is called.
### IDBObjectStore.prototype.stopObservingChanges(function(changes))
This removes the given function as an observer of the object store.

## Examples
See the html files for examples, hosted here:
https://dmurph.github.io/indexed-db-observers/

## FAQ
### Why create the observer in a transaction?
The observer needs to have a 'true' state of the world when it starts observing.  It shouldn't observe from the middle of another transaction that could fail or abort.  So we need to register the observer in a transaction to guarentee that we start observing from an unchanging state of the world.

## Ideas on how to represent 'changes'
The current API just replays all changes in an array.  This can be overkill, especially if these changes overlap.  Take, for example, the following changes:
 1. add 'a', 1
 2. add 'b', 2
 3. put 'putA', 1
 4. delete 2

These changes can culled to simple be
 1. add 'putA', 1

Another edge case involves range delete:
 1. put 'a', 1
 2. put 'b', 30
 3. delete range 20-40
 4. add 'c', 31

Here we can cull and represent the operation in the ordered 
 1. put 'a', 1
 2. delete range 20-40
 3. add 'c', 31

OR we can have transform this into the unordered change list
 * put 'a' 1
 * delete range 20 - (<31)
 * delete range (>31) - 40
 * add 'c', 31

(where these changes can be performed in any order)

Personally, I vote for culling but not transforming to the unordered change list.  If the developer wants, they can transform the ordered culled list to the unordered version, but they wouldn't be able to transform the other way.
