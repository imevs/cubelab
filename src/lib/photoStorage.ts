import type { UploadedPhoto } from './imageUtils.ts';

const DB_NAME = 'cubenet-lab-db';
const DB_VERSION = 1;
const STORE_NAME = 'photos';
const CURRENT_KEY = 'current';

function openPhotoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB is not available'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

export async function loadPhotosFromDb(): Promise<UploadedPhoto[]> {
  try {
    const db = await openPhotoDb();
    return await new Promise<UploadedPhoto[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(CURRENT_KEY);
      req.onsuccess = () => {
        const value = req.result;
        resolve(Array.isArray(value) ? (value as UploadedPhoto[]) : []);
      };
      req.onerror = () => reject(req.error ?? new Error('Failed to read photos from IndexedDB'));
      tx.oncomplete = () => db.close();
      tx.onabort = () => db.close();
    });
  } catch {
    return [];
  }
}

export async function savePhotosToDb(photos: UploadedPhoto[]): Promise<void> {
  try {
    const db = await openPhotoDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      if (photos.length === 0) {
        store.delete(CURRENT_KEY);
      } else {
        store.put(photos, CURRENT_KEY);
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('Failed to write photos to IndexedDB'));
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error ?? new Error('IndexedDB write aborted'));
      };
    });
  } catch {
    // Ignore storage quota / disabled IndexedDB errors gracefully
  }
}

export async function clearPhotosFromDb(): Promise<void> {
  try {
    const db = await openPhotoDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(CURRENT_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('Failed to clear photos from IndexedDB'));
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error ?? new Error('IndexedDB clear aborted'));
      };
    });
  } catch {
    // Ignore storage errors gracefully
  }
}
