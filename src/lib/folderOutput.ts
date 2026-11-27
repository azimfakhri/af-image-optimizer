import { uniquePath } from './naming';

interface DirHandle {
  getDirectoryHandle(name: string, o?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, o?: { create?: boolean }): Promise<{ createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }> }>;
}

type PickerWindow = Window & { showDirectoryPicker?: (o?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<DirHandle> };

export function canSaveToFolder(): boolean {
  return typeof window !== 'undefined' && typeof (window as PickerWindow).showDirectoryPicker === 'function';
}

/**
 * Write files into a user-chosen folder, recreating sub-folders (Chromium only).
 * Returns the number written, or null if the user cancelled the picker.
 */
export async function saveToFolder(files: { path: string; blob: Blob }[], onProgress?: (done: number) => void): Promise<number | null> {
  let root: DirHandle;
  try {
    root = await (window as PickerWindow).showDirectoryPicker!({ mode: 'readwrite', id: 'optimized' });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
  const taken = new Set<string>();
  const dirs = new Map<string, DirHandle>([['', root]]);
  let done = 0;
  for (const f of files) {
    const path = uniquePath(f.path, taken);
    const parts = path.split('/').filter((p) => p && p !== '.' && p !== '..');
    const name = parts.pop()!;
    let dirKey = '';
    let dir = root;
    for (const part of parts) {
      dirKey += part + '/';
      let next = dirs.get(dirKey);
      if (!next) {
        next = await dir.getDirectoryHandle(part, { create: true });
        dirs.set(dirKey, next);
      }
      dir = next;
    }
    const handle = await dir.getFileHandle(name, { create: true });
    const w = await handle.createWritable();
    await w.write(f.blob);
    await w.close();
    onProgress?.(++done);
  }
  return done;
}
