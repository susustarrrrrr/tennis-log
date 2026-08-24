# -*- coding: utf-8 -*-
"""生成 PWA 图标（纯标准库，无需第三方依赖）
   运行： python make_icons.py
"""
import math
import os
import struct
import zlib

OUT = os.path.dirname(os.path.abspath(__file__))
SS = 3  # 超采样倍数（抗锯齿）


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    return (lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t))


def rounded_alpha(x, y, size, radius):
    """圆角矩形内部返回 1，外部 0"""
    if radius <= 0:
        return 1.0
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    d = math.hypot(x - cx, y - cy)
    return 1.0 if d <= radius else 0.0


def render(size, ball_ratio=0.31, corner=0.22, bg=(225, 247, 239), bg2=(235, 250, 243)):
    n = size * SS
    px = bytearray(n * n * 4)
    cx, cy = n * 0.5, n * 0.52
    R = n * ball_ratio
    radius = n * corner
    seam_c = n * ball_ratio * 1.30
    seam_r = R * 1.16
    seam_w = R * 0.115

    for y in range(n):
        row = y * n * 4
        for x in range(n):
            i = row + x * 4
            a = rounded_alpha(x + 0.5, y + 0.5, n, radius)
            if a <= 0:
                continue
            # 背景斜向渐变
            t = (x + y) / (2.0 * n)
            r, g, b = mix(bg2, bg, t)

            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            d = math.hypot(dx, dy)
            if d <= R:
                # 球体渐变
                hx, hy = cx - R * 0.28, cy - R * 0.34
                hd = math.hypot(x + 0.5 - hx, y + 0.5 - hy) / (R * 1.7)
                r, g, b = mix((238, 255, 140), (188, 214, 62), min(1.0, hd))
                # 缝线（左右两条弧）
                for sc in (cx - seam_c, cx + seam_c):
                    sd = abs(math.hypot(x + 0.5 - sc, y + 0.5 - cy) - seam_r)
                    if sd < seam_w:
                        k = 1.0 - (sd / seam_w) ** 3
                        r, g, b = mix((r, g, b), (255, 255, 255), min(1.0, k * 1.6))
                # 边缘轻微暗角
                edge = d / R
                if edge > 0.86:
                    r, g, b = mix((r, g, b), (150, 172, 48), (edge - 0.86) / 0.14 * 0.35)
            px[i] = int(r)
            px[i + 1] = int(g)
            px[i + 2] = int(b)
            px[i + 3] = 255
    return downsample(px, n, size)


def downsample(px, n, size):
    out = bytearray(size * size * 4)
    f = SS * SS
    for y in range(size):
        for x in range(size):
            r = g = b = a = 0
            for j in range(SS):
                base = ((y * SS + j) * n + x * SS) * 4
                for i in range(SS):
                    k = base + i * 4
                    al = px[k + 3]
                    r += px[k] * al
                    g += px[k + 1] * al
                    b += px[k + 2] * al
                    a += al
            o = (y * size + x) * 4
            if a:
                out[o] = int(r / a)
                out[o + 1] = int(g / a)
                out[o + 2] = int(b / a)
            out[o + 3] = int(a / f)
    return out


def write_png(path, size, rgba, opaque_bg=None):
    if opaque_bg:
        # 铺一层不透明底色（iOS 图标不允许透明）
        flat = bytearray(size * size * 4)
        for i in range(0, len(rgba), 4):
            a = rgba[i + 3] / 255.0
            for c in range(3):
                flat[i + c] = int(rgba[i + c] * a + opaque_bg[c] * (1 - a))
            flat[i + 3] = 255
        rgba = flat

    raw = bytearray()
    for y in range(size):
        raw.append(0)
        raw += rgba[y * size * 4:(y + 1) * size * 4]

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)
    print('wrote', path, size)


if __name__ == '__main__':
    write_png(os.path.join(OUT, 'icon-192.png'), 192, render(192))
    write_png(os.path.join(OUT, 'icon-512.png'), 512, render(512))
    write_png(os.path.join(OUT, 'icon-maskable-512.png'), 512,
              render(512, ball_ratio=0.24, corner=0.0))
    write_png(os.path.join(OUT, 'apple-touch-icon.png'), 180,
              render(180, corner=0.0), opaque_bg=(225, 247, 239))
