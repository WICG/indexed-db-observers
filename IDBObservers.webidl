partial interface IDBDatabase {
    [CallWith=ScriptState, RaisesException] IDBObserverControl observe((sequence<DOMString> or sequence<IDBObserverDataStoreRange>) objectStores, IDBObserverCallback callback, optional IDBObserverOptions options);
};

interface IDBObserverControl {
    void stop();
    boolean isAlive();
};

dictionary IDBObserverDataStoreRange {
    DOMString objectStoreName;
    IDBKeyRange range;
};

callback IDBObserverCallback = void (IDBObserverChanges);

dictionary IDBObserverOptions {
    boolean includeValues;
    boolean includeTransaction;
    boolean excludeRecords;
    boolean onlyExternal;
};

dictionary IDBObserverChanges {
    boolean initializing;
    IDBDatabase db;
    boolean isExternal;
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
