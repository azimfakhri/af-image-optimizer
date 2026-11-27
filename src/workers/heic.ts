/**
 * HEIC/HEIF decoding for browsers without native support (Chrome, Firefox).
 * libheif (LGPL-3.0) is loaded with a dynamic import, so it stays a separate, unmodified, replaceable file
 * that is only downloaded when someone actually drops a HEIC. See THIRD_PARTY_NOTICES.md.
 */

interface HeifImage {
  get_width(): number;
  get_height(): number;
  is_primary(): boolean;
  display(target: ImageData, cb: (result: ImageData | null) => void): void;
  free(): void;
}
interface Libheif {
  HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] };
}

let lib: Promise<Libheif> | null = null;

function load(): Promise<Libheif> {
  lib ??= import('libheif-js/libheif-wasm/libheif-bundle.mjs').then(async (m) => {
    const mod = (m.default as (opts?: object) => Libheif | Promise<Libheif>)();
    return await mod;
  });
  lib.catch(() => (lib = null));
  return lib;
}

/** Decodes the primary image to RGBA. libheif applies the HEIF rotation/mirror transforms itself. */
export async function decodeHeic(file: Blob): Promise<ImageData> {
  const libheif = await load();
  const images = new libheif.HeifDecoder().decode(new Uint8Array(await file.arrayBuffer()));
  if (!images.length) throw new Error("Couldn't decode this HEIC file.");
  try {
    const img = images.find((i) => i.is_primary()) ?? images[0];
    const out = new ImageData(img.get_width(), img.get_height());
    await new Promise<void>((resolve, reject) =>
      img.display(out, (r) => (r ? resolve() : reject(new Error("Couldn't decode this HEIC file.")))),
    );
    return out;
  } finally {
    for (const i of images) i.free();
  }
}
