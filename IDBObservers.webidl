partial interface IDBTransaction {
    [RaisesException, NewObject] IDBObserverControl observe(IDBObserverCallback callback, optional IDBObserverOptions options);
};

// This control:
// * Holds a reference to the database connection.
// * Allows the user to stop this oberver from observing.
// * Check if the observer is currently observing.
interface IDBObserverControl {
    [ReadOnly] IDBDatabase db;
    
    void stop();
    boolean isAlive();
};

callback IDBObserverCallback = void (IDBObserverChanges);

dictionary IDBObserverOptions {
    // Optionally include a readonly transaction in the observer callback.
    boolean transaction;
    // Optionally only listen for changes from other db connections.
    boolean onlyExternal;
    // Optional JSON object of String (object store name) -> IDBObserverDataStoreOptions.
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
