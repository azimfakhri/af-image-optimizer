"""Fixture helpers (stdlib only): transparent logo PNG and EXIF orientation injection."""
import math, struct, sys, zlib

def png(path, w, h, pixels):
    raw = b''.join(b'\x00' + bytes(pixels[y * w * 4:(y + 1) * w * 4]) for y in range(h))
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    data += chunk(b'tEXt', b'Comment\x00fixture logo') + chunk(b'IDAT', zlib.compress(raw, 0)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)

def logo(path, size=800):
    # Two flat colours with hard edges on a transparent background: <=256 colours, lots of alpha.
    px = bytearray(size * size * 4)
    c = size / 2
    for y in range(size):
        for x in range(size):
            i = (y * size + x) * 4
            d = math.hypot(x - c, y - c)
            if d < size * 0.42:
                px[i:i + 4] = (220, 40, 60, 255) if (x // 80 + y // 80) % 2 else (30, 90, 200, 255)
            elif d < size * 0.46:
                px[i:i + 4] = (20, 20, 20, 128)
    png(path, size, size, px)

def set_orientation(path, orientation):
    data = open(path, 'rb').read()
    assert data[:2] == b'\xff\xd8'
    tiff = b'II*\x00' + struct.pack('<I', 8) + struct.pack('<H', 1) + struct.pack('<HHII', 0x0112, 3, 1, orientation) + struct.pack('<I', 0)
    body = b'Exif\x00\x00' + tiff
    app1 = b'\xff\xe1' + struct.pack('>H', len(body) + 2) + body
    open(path, 'wb').write(data[:2] + app1 + data[2:])

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'logo': logo(sys.argv[2])
    elif cmd == 'orient': set_orientation(sys.argv[2], int(sys.argv[3]))
