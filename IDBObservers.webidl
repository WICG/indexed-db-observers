partial interface IDBTransaction {
    // Starts observing on the object stores in this transaction (IDBTransaction.objectStoreNames).
    [RaisesException, NewObject] IDBObserverControl observe(IDBObserverCallback callback, optional IDBObserverOptions options);
};

// This control:
// * Holds a reference to the database connection.
// * Allows the user to stop this oberver from observing.
// * Check if the observer is currently observing.
interface IDBObserverControl {
    [ReadOnly] IDBDatabase db;
    // This allows the developer to check which options they specified are supported.
    // This is a parsed and validated version of the options given to |observe(...)|.
    [ReadOnly] IDBObserverOptions options;

    void stop();
    boolean isAlive();
};

callback IDBObserverCallback = void (IDBObserverChanges);

dictionary IDBObserverOptions {
    // Optionally include a readonly transaction in the observer callback.
    // The transaction is over all the object stores that the observer is observing.
    boolean transaction;
    // Optionally only listen for changes from other db connections.
    boolean onlyExternal;
    // Optional javascript Map<String, IDBObserverDataStoreOptions>.
    any storesOptions;
};

dictionary IDBObserverDataStoreOptions {
    // Optionally include values in the change records for this data store.
    boolean value;
    // Optionally remove records from the observer callback.
    boolean noRecords;
    // Optionally specify the ranges to listen to in this object store.
    sequence<IDBKeyRange> ranges;
};

dictionary IDBObserverChanges {
    IDBDatabase db;
    // Transaction contains the same object stores as the transaction on which IDBTransaction.observe was called.
    IDBTransaction transaction;
    // This is the javascript Map<String, sequence<IDBObserverChangeRecord>>,
    // where the key is the object store name.
    any records;
};

dictionary IDBObserverChangeRecord {
    IDBObserverChangeRecordType type;
    // When the record is a "delete" type, this is an IDBKeyRange.
    any key;
    any value;
};

enum IDBObserverChangeRecordType {
    "add", "put", "delete", "clear"
};
