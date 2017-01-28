import '..'

const ctrl = new IDBTransaction().observe(

  // listener
  changes => {

    // database, transaction, `from external context`
    const db: IDBDatabase = changes.db
    const txn: IDBTransaction = changes.transaction
    const external: boolean = changes.isExternalChange
    console.assert(db instanceof IDBDatabase)
    console.assert(txn instanceof IDBTransaction)
    console.assert(typeof external === 'boolean')

    // map of records
    const records: Map<string, {
      type: 'add' | 'delete' | 'put' | 'clear'
      key?: IDBValidKey | IDBKeyRange
      value?: any
    }[]> = changes.records
    records.forEach((data, objectStoreName) => {

      // object store
      const osName: string = objectStoreName
      console.assert(typeof osName === 'string')

      // records
      data.forEach(one => {
        const type: string = one.type
        const key: IDBValidKey | IDBKeyRange = one.key
        const value = one.value
        console.assert(typeof type === 'string')
        console.log(key, value)
      })
    })
  },

  // options
  {
    includeValues: false,
    includeTransaction: false,
    excludeRecords: false,
    onlyExternal: false,
    ranges: new Map<string, IDBValidKey | IDBKeyRange>()
  }
)

// control
const alive: boolean = ctrl.isAlive()
console.assert(typeof alive === 'boolean')
ctrl.stop()
