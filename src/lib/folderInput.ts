export interface Picked {
  file: File;
  /** Path relative to the dropped/picked root, including the file name. */
  relativePath: string;
}

/** Recursively read every file from a drop. Must be called synchronously inside the drop handler. */
export function filesFromDataTransfer(dt: DataTransfer): Promise<Picked[]> {
  const entries: FileSystemEntry[] = [];
  const loose: File[] = [];
  for (const item of Array.from(dt.items)) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
    else {
      const f = item.getAsFile();
      if (f) loose.push(f);
    }
  }
  return (async () => {
    const out: Picked[] = loose.map((file) => ({ file, relativePath: file.name }));
    for (const e of entries) await walk(e, '', out);
    return out;
  })();
}

async function walk(entry: FileSystemEntry, prefix: string, out: Picked[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
    out.push({ file, relativePath: prefix + file.name });
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const dirPrefix = `${prefix}${entry.name}/`;
    // readEntries returns batches (≈100 in Chrome) until empty.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const child of batch) await walk(child, dirPrefix, out);
    }
  }
}

export function filesFromInput(list: FileList): Picked[] {
  return Array.from(list).map((file) => ({ file, relativePath: file.webkitRelativePath || file.name }));
}

/** File picker accept list: extensions are named explicitly because .jfif often has an empty or odd MIME type. */
export const ACCEPT = [
  '.jpg', '.jpeg', '.jfif', '.jpe', '.pjpeg', '.pjp', '.png', '.webp', '.avif', '.heic', '.heif',
  'image/jpeg', 'image/pjpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif',
].join(',');
