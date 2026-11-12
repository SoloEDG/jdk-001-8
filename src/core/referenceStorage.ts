import {
  REFERENCE_DB_NAME,
  REFERENCE_DB_VERSION,
  REFERENCE_STORE_NAME,
} from './constants'
import type { ReferenceImageMeta } from './types'

export interface StoredReferenceImage {
  projectId: string
  dataUrl: string
  meta: ReferenceImageMeta
  savedAt: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前浏览器不支持 IndexedDB，无法保存参考图。'))
      return
    }

    const request = indexedDB.open(REFERENCE_DB_NAME, REFERENCE_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(REFERENCE_STORE_NAME)) {
        db.createObjectStore(REFERENCE_STORE_NAME, { keyPath: 'projectId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('无法打开参考图存储。'))
    request.onblocked = () => reject(new Error('参考图存储被其他窗口占用。'))
  })

  dbPromise = promise
  promise.catch(() => {
    if (dbPromise === promise) dbPromise = null
  })
  return promise
}

function transact<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let result: T
        const tx = db.transaction(REFERENCE_STORE_NAME, mode)
        const store = tx.objectStore(REFERENCE_STORE_NAME)
        const request = run(store)

        request.onsuccess = () => {
          result = request.result
        }
        request.onerror = () =>
          reject(request.error ?? new Error('参考图存储操作失败。'))
        tx.oncomplete = () => resolve(result)
        tx.onerror = () => reject(tx.error ?? new Error('参考图存储操作失败。'))
        tx.onabort = () => reject(tx.error ?? new Error('参考图存储操作被中止。'))
      }),
  )
}

export async function saveReferenceImage(
  projectId: string,
  dataUrl: string,
  meta: ReferenceImageMeta,
): Promise<void> {
  const record: StoredReferenceImage = {
    projectId,
    dataUrl,
    meta,
    savedAt: Date.now(),
  }
  await transact('readwrite', (store) => store.put(record))
}

export async function loadReferenceImage(
  projectId: string,
): Promise<StoredReferenceImage | null> {
  const record = await transact<StoredReferenceImage | undefined>('readonly', (store) =>
    store.get(projectId),
  )
  return record ?? null
}

export async function deleteReferenceImage(projectId: string): Promise<void> {
  await transact('readwrite', (store) => store.delete(projectId))
}
