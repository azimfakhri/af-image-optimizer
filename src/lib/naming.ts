/** Strip the final extension from a file name. */
export function baseName(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

export function outputName(original: string, ext: string, suffix = ''): string {
  return `${baseName(original)}${suffix}.${ext}`;
}

/** Return `path`, or `path` with -2, -3… before the extension if already taken. Records the result in `taken`. */
export function uniquePath(path: string, taken: Set<string>): string {
  const key = (p: string) => p.toLowerCase();
  if (!taken.has(key(path))) {
    taken.add(key(path));
    return path;
  }
  const slash = path.lastIndexOf('/');
  const dir = path.slice(0, slash + 1);
  const file = path.slice(slash + 1);
  const dot = file.lastIndexOf('.');
  const stem = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot) : '';
  for (let n = 2; ; n++) {
    const candidate = `${dir}${stem}-${n}${ext}`;
    if (!taken.has(key(candidate))) {
      taken.add(key(candidate));
      return candidate;
    }
  }
}

export function pastedName(date: Date, mime: string): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1] || 'png';
  return `pasted-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}.${ext}`;
}
