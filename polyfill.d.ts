type KeyOrRange = IDBValidKey | IDBKeyRange

interface IDBTransaction {
  observe(
    listener: (changes: {
      db: IDBDatabase
      transaction: IDBTransaction
      isExternalChange: boolean
      records: Map<string, {
        type: 'add' | 'delete' | 'put' | 'clear'
        key?: KeyOrRange
        value?: any
      }[]>
    }) => void,
    options?: {
      includeValues?: boolean
      includeTransaction?: boolean
      excludeRecords?: boolean
      onlyExternal?: boolean
      ranges?: Map<string, KeyOrRange>
    }
  ): {
    isAlive(): boolean
    stop(): void
  }
}
