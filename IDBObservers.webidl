partial interface IDBTransaction {
    [RaisesException, NewObject] IDBObserverControl observe(IDBObserverCallback callback, optional IDBObserverOptions options);
};

interface IDBObserverControl {
    void stop();
    boolean isAlive();
};

callback IDBObserverCallback = void (IDBObserverChanges);

dictionary IDBObserverOptions {
    boolean includeValues;
    boolean includeTransaction;
    boolean excludeRecords;
    boolean onlyExternal;
    any ranges; // optional javascript map of string object store name to IDBKeyRange
};

dictionary IDBObserverChanges {
    IDBDatabase db;
    IDBTransaction transaction;
    // This is the javascript Map object with key type of String and value type of sequence<IDBObserverChangeRecord>
    any records;
};

enum IDBObserverChangeRecordType {
    "add", "put", "delete", "clear"
};

dictionary IDBObserverChangeRecord {
    IDBObserverChangeRecordType type;
    // When the record is a "delete" type, this is an IDBKeyRange
    any key;
    any value;
};
