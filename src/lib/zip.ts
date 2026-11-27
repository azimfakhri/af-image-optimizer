import { zip, type Zippable } from 'fflate';
import { uniquePath } from './naming';

/** Build a ZIP (store mode: images are already compressed). Paths keep folder structure; collisions get -2, -3… */
export async function buildZip(files: { path: string; blob: Blob }[]): Promise<Blob> {
  const taken = new Set<string>();
  const tree: Zippable = {};
  for (const f of files) {
    const path = uniquePath(f.path, taken);
    tree[path] = [new Uint8Array(await f.blob.arrayBuffer()), { level: 0 }];
  }
  const data = await new Promise<Uint8Array>((res, rej) => zip(tree, { level: 0 }, (err, out) => (err ? rej(err) : res(out))));
  return new Blob([data as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
