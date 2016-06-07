dictionary IDBObserverInit {
  boolean transaction = false;
  boolean values = false;
  boolean noRecords = false;
  boolean onlyExternal = false;
};

callback IDBObserverCallback = void (IDBObserverChanges);

[Constructor(IDBObserverCallback calback, IDBObserverInit options)]
interface IDBObserver {
    // Starts observing on the object stores in 'transaction' (IDBTransaction.objectStoreNames)
    // after that transaction is completed.
    // 'ranges' is a Map<String, sequence<IDBKeyRange>>, which filter the observation by
    // object store to the given key ranges.
    [RaisesException]
    void observe(IDBDatabase target, IDBTransaction transaction, optional any ranges);
    
    // Stops all observations to the given database.
    [RaisesException]
    void unobserve(IDBDatabase database);
};

interface IDBObserverChanges {
    readonly IDBDatabase db;
    // Transaction contains the same object stores as the transaction on which IDBTransaction.observe was called.
    readonly IDBTransaction transaction;
    // This is the javascript Map<String, sequence<IDBObserverChangeRecord>>,
    // where the key is the object store name.
    readonly any records;
};

interface IDBObserverChangeRecord {
    readonly IDBObserverChangeRecordType type;
    // When the record is a "delete" type, this is an IDBKeyRange.
    readonly any key;
    readonly any value;
};

enum IDBObserverChangeRecordType {
    "add", "put", "delete", "clear"
};
