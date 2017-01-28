import '..'

const ctrl = new IDBTransaction().observe(

  // listener
  changes => {

    // database, transaction, `from external context`
    const db: IDBDatabase = changes.db
    const txn: IDBTransaction = changes.transaction
    const external: boolean = changes.isExternalChange
    console.log(db, txn, external)

    // map of records
    const records: Map<string, {
      type: 'add' | 'delete' | 'put' | 'clear'
      key?: KeyOrRange
      value?: any
    }[]> = changes.records
    records.forEach((data, objectStoreName) => {

      // object store
      const osName: string = objectStoreName
      console.log(osName)

      // records
      data.forEach(one => {
        const type: string = one.type
        const key: KeyOrRange = one.key
        const value = one.value
        console.log(type, key, value)
      })
    })
  },

  // options
  {
    includeValues: false,
    includeTransaction: false,
    excludeRecords: false,
    onlyExternal: false,
    ranges: new Map<string, KeyOrRange>()
  }
)

// control
const alive: boolean = ctrl.isAlive()
console.log(alive)
ctrl.stop()
