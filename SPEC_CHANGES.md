# Spec changes
These are the approximate spec changes that would happen. See [IDBObservers.webidl](IDBObservers.webidl) for the WebIDL file.


A transaction has list of pending observers to create (with the options & callback function), and a list of changes per object store (with the operation type, key, and optional value).

## Observer Creation
When the observe method is called on a transaction, the given options, callback, and the transaction's object stores are given a unique id and are stored in a `pending_observer_construction` list as an `Observer`.  This id is given to the observer control, which is returned. When the transaction is completed successfuly, the Observer is added to the domain-specific list of observers.  If the transaction is not completed successfuly, this does not happen.

## Change Recording
Every change would record an entry in the `change_list` for the given object store.

## Observer Calling
When a transaction successfully completes, send the `change_list` changes to all observers that have objects stores touched by the completed transaction. When sending the changes to each observer, all changes to objects stores not observed by the observer are filtered out.

## Observer Transactions
The transactions given to the observers have one behavior difference - they cannot be used by an observer. This probably means we'll need to give them a new type - perhaps 'snapshot' or 'readonly-snapshot'.

## Exceptions
An exception is thrown in the following cases (and in the following order):

1. `.observe` on a database that is closed.
2. `.observe` on a 'versionchange' transaction.
2. `.observe` on a transaction that is finished.
3. `.observe` on a trThese are the approximate spec changes that would happen. See [IDBObservers.webidl](IDBObservers.webidl) for the WebIDL file.

The following extra 'hidden variables' will be kept track of in the spec inside of IDBTransaction:
 * `pending_observer_construction` - a list of {uuid string, options map, callback function} tuples.
 * `change_list` - a per-object-store list of { operation string, optional key IDBKeyRange, optional value object}.  The could be done as a map of object store name to the given list.

## Observer Creation
When the observe method is called on a transaction, the given options, callback, and the transaction's object stores are given a unique id and are stored in a `pending_observer_construction` list as an `Observer`.  This id is given to the observer control, which is returned. When the transaction is completed successfuly, the Observer is added to the domain-specific list of observers.  If the transaction is not completed successfuly, this does not happen.

## Change Recording
Every change would record an entry in the `change_list` for the given object store.

## Observer Calling
When a transaction successfully completes, send the `change_list` changes to all observers that have objects stores touched by the completed transaction. When sending the changes to each observer, all changes to objects stores not observed by the observer are filtered out.

## Observer Transactions
The transactions given to the observers have one behavior difference - they cannot be used by an observer. This probably means we'll need to give them a new type - perhaps 'snapshot' or 'readonly-snapshot'.

## Exceptions
Non-idl-possible exceptions are thrown in the following cases (and in the following order):

1. `.observe` on a database that is closed.
2. `.observe` on a 'versionchange' transaction.
2. `.observe` on a transaction that is finished.
3. `.observe` on a transaction that is not active.
4. `.observe` on a 'snapshot' type transaction (or whatever we call it - a transaction given in an observer callback).
6. `.unobserve` on a database connection that isn't being observed.

# Culling Spec Changes
This is a possible future feature, referenced in the main Explainer.

Whenever a change succeeds in a transaction, it adds it to a `culled_change_list` for the given object store in the following manner:

(Note: `putAll` and `addAll` operations could be seperated into individual put and add changes.)

#### Add Operation
Append the add operation, key and value, on end of operations list.

#### Put Operation
1. Iterate backwards in the `culled_change_list` and look for any 'add', 'put' or 'delete' change with an **intersecting key**.
2. If a put is reached, delete that entry from the list.
3. If an add is reached, replace the value of the add with the new put value and return.
4. If a delete is reached, then append the new put at the end of operations and return.
5. If the end of the list is reached, then append the new put at the end of operations and return.

#### Delete Operation
1. Iterate backwards in the `culled_change_list` and look for any 'add', 'put' or 'delete' change with an **intersecting key**.
2. If a put is reached, delete that entry from the list.
3. If an add is reached, delete that entry from the list.
4. If a delete is reached, modify the reached delete to be a union of it's current range and the new delete range.
5. If we reach the end of the operations list and the new delete was never combined with an older delete, append the delete to the list of operations.

#### Clear Operation
1. Clear the `culled_change_list` for that object store.
2. Add a 'clear' operation to list.ansaction that is not active.
4. `.observe` on a 'snapshot' type transaction (or whatever we call it - a transaction given in an observer callback).
5. `.observe` invalid options
  1. `operations` is not specified
  2. `operations' is empty
  3. `operations` contains unknown operation types (not 'add', 'put', 'clear', or 'delete')
  4. `ranges` contains object stores not in the observing transaction
6. `.unobserve` on a database connection that isn't being observed.
