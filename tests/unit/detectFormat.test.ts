import { describe, expect, it } from 'vitest';
import { detectFormat } from '../../src/lib/detectFormat';

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ftyp = (major: string, ...compat: string[]) => bytes(u32be(16 + compat.length * 4), 'ftyp', major, [0, 0, 0, 0], ...compat);

describe('detectFormat', () => {
  it('detects JPEG/JFIF regardless of name', () => {
    expect(detectFormat(bytes([0xff, 0xd8, 0xff, 0xe0], 'JFIF'))).toEqual({ ok: true, format: 'jpeg' });
    expect(detectFormat(bytes([0xff, 0xd8, 0xff, 0xe1]))).toEqual({ ok: true, format: 'jpeg' });
  });
  it('detects PNG', () => {
    expect(detectFormat(bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({ ok: true, format: 'png' });
  });
  it('detects still WebP and rejects animated WebP', () => {
    expect(detectFormat(bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8 ', [0, 0, 0, 0]))).toEqual({ ok: true, format: 'webp' });
    const anim = bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8X', [10, 0, 0, 0], [0x12, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(detectFormat(anim).ok).toBe(false);
  });
  it('classifies ISO-BMFF by major then compatible brands', () => {
    expect(detectFormat(ftyp('heic', 'mif1', 'heic'))).toEqual({ ok: true, format: 'heic' });
    expect(detectFormat(ftyp('avif', 'mif1', 'miaf'))).toEqual({ ok: true, format: 'avif' });
    expect(detectFormat(ftyp('mif1', 'mif1', 'avif'))).toEqual({ ok: true, format: 'avif' });
    expect(detectFormat(ftyp('mif1', 'mif1', 'heic'))).toEqual({ ok: true, format: 'heic' });
    expect(detectFormat(ftyp('isom', 'mp41')).ok).toBe(false);
  });
  it('rejects GIF, garbage and empty input', () => {
    expect(detectFormat(bytes('GIF89a')).ok).toBe(false);
    expect(detectFormat(bytes('hello world!')).ok).toBe(false);
    expect(detectFormat(new Uint8Array()).ok).toBe(false);
  });
});
