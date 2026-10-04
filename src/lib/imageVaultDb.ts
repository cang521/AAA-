/**
 * imageVaultDb.ts
 * Dedicated IndexedDB store for image Blobs (PhoneSimImageVaultDB_v1)
 * Keeps full-size image binaries out of STORE_MESSAGES, eliminating OOM when searching or scanning chat history.
 */

const DB_NAME = 'PhoneSimImageVaultDB_v1';
const DB_VERSION = 1;
const STORE_IMAGE_BLOBS = 'image_blobs';

export interface StoredImageBlob {
  imageId: string;
  blob: Blob;
  mimeType: string;
  width?: number;
  height?: number;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getImageVaultDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported'));
      return;
    }

    const req = window.indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_IMAGE_BLOBS)) {
        db.createObjectStore(STORE_IMAGE_BLOBS, { keyPath: 'imageId' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

/**
 * Save an image Blob to the dedicated image vault
 */
export async function saveImageBlob(
  imageId: string,
  blob: Blob,
  metadata?: { width?: number; height?: number }
): Promise<void> {
  const db = await getImageVaultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_IMAGE_BLOBS], 'readwrite');
    const store = tx.objectStore(STORE_IMAGE_BLOBS);
    const item: StoredImageBlob = {
      imageId,
      blob,
      mimeType: blob.type || 'image/jpeg',
      width: metadata?.width,
      height: metadata?.height,
      createdAt: Date.now(),
    };
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieve an image Blob from the image vault
 */
export async function getImageBlob(imageId: string): Promise<Blob | null> {
  const db = await getImageVaultDb();
  return new Promise((resolve) => {
    const tx = db.transaction([STORE_IMAGE_BLOBS], 'readonly');
    const store = tx.objectStore(STORE_IMAGE_BLOBS);
    const req = store.get(imageId);
    req.onsuccess = () => {
      const res = req.result as StoredImageBlob | undefined;
      resolve(res ? res.blob : null);
    };
    req.onerror = () => resolve(null);
  });
}

/**
 * Generate a temporary Object URL for a stored image Blob (MUST be revoked when done!)
 */
export async function getImageObjectUrl(imageId: string): Promise<string | null> {
  const blob = await getImageBlob(imageId);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

/**
 * Delete an image Blob from the vault
 */
export async function deleteImageBlob(imageId: string): Promise<void> {
  const db = await getImageVaultDb();
  return new Promise((resolve) => {
    const tx = db.transaction([STORE_IMAGE_BLOBS], 'readwrite');
    const store = tx.objectStore(STORE_IMAGE_BLOBS);
    const req = store.delete(imageId);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}
