#!/usr/bin/env python3
"""生成万年历GPS应用图标 (多尺寸PNG)"""

import struct
import zlib
import os
import math

# 图标目录
ICONS_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(ICONS_DIR, exist_ok=True)

# 需要的尺寸
SIZES = [72, 96, 120, 128, 144, 152, 180, 192, 384, 512]


def create_png(width, height, filename):
    """生成一个红底金色日历图标的PNG文件"""

    def create_pixel_data(w, h):
        """生成像素数据 (RGBA)"""
        raw = b''
        cx, cy = w / 2, h / 2
        r = min(w, h) * 0.4  # 圆形半径

        for y in range(h):
            raw += b'\x00'  # filter byte (none)
            for x in range(w):
                # 背景: 深红色渐变
                bg_r = int(198 + (x / w) * 20)
                bg_g = int(40 + (y / h) * 15)
                bg_b = int(40 + (x / w) * 20)
                a = 255

                # 日历图标绘制 (简化)
                left = int(w * 0.15)
                right = int(w * 0.85)
                top = int(h * 0.15)
                bottom = int(h * 0.85)
                header_bottom = int(h * 0.38)

                if left <= x <= right and top <= y <= bottom:
                    # 日历主体 - 白色
                    if top <= y <= header_bottom:
                        r_val, g_val, b_val = 198, 40, 40  # 红色标题栏
                    else:
                        r_val, g_val, b_val = 240, 230, 210  # 米白色
                    a = 255
                elif left <= x <= right and y <= top + 4:
                    r_val, g_val, b_val = 255, 255, 255
                    a = 200
                else:
                    r_val, g_val, b_val = bg_r, bg_g, bg_b

                # 圆角效果 (四个角)
                corner_r = w * 0.08
                corners = [
                    (left, top),
                    (right, top),
                    (left, bottom),
                    (right, bottom)
                ]
                for cx_c, cy_c in corners:
                    dx, dy = x - cx_c, y - cy_c
                    dist = math.sqrt(dx*dx + dy*dy)
                    if dist < corner_r:
                        if (dx > 0 and dy > 0 and cx_c == left and cy_c == top):
                            continue
                        if (dx < 0 and dy > 0 and cx_c == right and cy_c == top):
                            continue
                        if (dx > 0 and dy < 0 and cx_c == left and cy_c == bottom):
                            continue
                        if (dx < 0 and dy < 0 and cx_c == right and cy_c == bottom):
                            continue

                raw += struct.pack('BBBB',
                    min(255, max(0, int(r_val))),
                    min(255, max(0, int(g_val))),
                    min(255, max(0, int(b_val))),
                    a
                )

        return raw

    # 生成原始像素
    raw_pixels = create_pixel_data(width, height)

    # PNG 编码
    def write_chunk(chunk_type, data):
        chunk = chunk_type + data
        crc = zlib.crc32(chunk) & 0xFFFFFFFF
        return struct.pack('>I', len(data)) + chunk + struct.pack('>I', crc)

    png = b'\x89PNG\r\n\x1a\n'
    png += write_chunk(b'IHDR', struct.pack('>IIBBBBB',
        width, height, 8, 6, 0, 0, 0))  # 8bit RGBA

    # 压缩像素数据
    compressed = zlib.compress(raw_pixels)
    png += write_chunk(b'IDAT', compressed)
    png += write_chunk(b'IEND', b'')

    with open(filename, 'wb') as f:
        f.write(png)
    print(f'  ✅ {os.path.basename(filename)} ({width}x{height})')


if __name__ == '__main__':
    print('🎨 生成万年历应用图标...')
    for size in SIZES:
        filename = os.path.join(ICONS_DIR, f'icon-{size}x{size}.png')
        create_png(size, size, filename)

    # 同时生成一个正方形 SVG 作为备用
    svg_path = os.path.join(ICONS_DIR, 'icon.svg')
    with open(svg_path, 'w') as f:
        f.write('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#C62828"/>
  <rect x="77" y="77" width="358" height="358" rx="20" fill="#FFF8E7"/>
  <rect x="77" y="77" width="358" height="120" rx="20" fill="#B71C1C"/>
  <text x="256" y="380" text-anchor="middle" font-size="140" font-family="sans-serif" fill="#D4A017">历</text>
  <circle cx="160" cy="137" r="20" fill="#4CAF50"/>
  <text x="380" y="145" text-anchor="middle" font-size="30" font-family="sans-serif" fill="#FFF8E7">2026</text>
</svg>''')
    print(f'  ✅ icon.svg (矢量备用)')
    print(f'🎉 共生成 {len(SIZES)} 个PNG图标 + 1个SVG')
