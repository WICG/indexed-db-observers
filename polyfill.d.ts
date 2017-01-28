declare namespace IndexedDBObservers {

  interface Record {
    type: 'add' | 'delete' | 'put' | 'clear'
    key?: IDBValidKey | IDBKeyRange
    value?: any
  }

  function listener(changes: {
    db: IDBDatabase
    transaction: IDBTransaction
    isExternalChange: boolean
    records: Map<string, Record[]>
  }): void

  interface Options {
    includeValues?: boolean
    includeTransaction?: boolean
    excludeRecords?: boolean
    onlyExternal?: boolean
    ranges?: Map<string, IDBValidKey | IDBKeyRange>
  }

  interface Control {
    isAlive(): boolean
    stop(): void
  }
}

interface IDBTransaction {
  observe(
    listener: typeof IndexedDBObservers.listener,
    options?: IndexedDBObservers.Options
  ): IndexedDBObservers.Control
}
