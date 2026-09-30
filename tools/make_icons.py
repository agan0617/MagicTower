"""產生網頁與 App 用的圖示（像素風的塔＋八分音符）。
用法：python tools/make_icons.py [Android res 目錄]"""
import os
import sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

BG_TOP = (26, 16, 52)
BG_BOT = (70, 30, 100)
TOWER = (10, 8, 20)
EDGE = (60, 44, 110)
WIN = (192, 124, 245)
DOOR = (255, 216, 74)
NOTE = (255, 216, 74)
NOTE_D = (201, 146, 26)
STAR = (255, 255, 255)


def art(bg=True):
    """24×24 的原圖"""
    im = Image.new('RGBA', (24, 24), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if bg:
        for y in range(24):
            k = y / 23
            c = tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * k) for i in range(3))
            d.line([(0, y), (23, y)], fill=c + (255,))
        for x, y in [(3, 3), (6, 7), (2, 12), (20, 14), (21, 2), (4, 18)]:
            d.point((x, y), fill=STAR + (255,))
    # 塔身與屋頂
    d.rectangle([8, 8, 15, 21], fill=TOWER + (255,))
    d.line([(8, 8), (8, 21)], fill=EDGE + (255,))
    d.polygon([(6, 9), (11.5, 2), (17, 9)], fill=TOWER + (255,))
    d.line([(6, 9), (11, 3)], fill=EDGE + (255,))
    for y in (11, 14, 17):
        d.rectangle([11, y, 12, y + 1], fill=WIN + (255,))
    d.rectangle([11, 20, 12, 21], fill=DOOR + (255,))
    # 地面
    d.rectangle([4, 22, 19, 22], fill=(40, 26, 70, 255))
    # 八分音符
    d.rectangle([19, 5, 19, 12], fill=NOTE + (255,))
    d.rectangle([17, 12, 19, 13], fill=NOTE + (255,))
    d.rectangle([16, 12, 16, 12], fill=NOTE_D + (255,))
    d.point((20, 6), fill=NOTE + (255,))
    d.point((21, 7), fill=NOTE + (255,))
    d.point((21, 8), fill=NOTE + (255,))
    return im


def scaled(size, pad_ratio=0.0, bg=True):
    base = art(bg)
    if pad_ratio == 0:
        return base.resize((size, size), Image.NEAREST)
    inner = int(size * (1 - pad_ratio * 2)) // 24 * 24
    canvas = Image.new('RGBA', (size, size), BG_TOP + (255,) if bg else (0, 0, 0, 0))
    if bg:
        full = base.resize((size, size), Image.NEAREST)
        canvas.paste(full, (0, 0))
        fg = art(False).resize((inner, inner), Image.NEAREST)
        canvas = Image.new('RGBA', (size, size))
        bgonly = Image.new('RGBA', (24, 24))
        dd = ImageDraw.Draw(bgonly)
        for y in range(24):
            k = y / 23
            c = tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * k) for i in range(3))
            dd.line([(0, y), (23, y)], fill=c + (255,))
        canvas.paste(bgonly.resize((size, size), Image.NEAREST), (0, 0))
        off = (size - inner) // 2
        canvas.alpha_composite(fg, (off, off))
        return canvas
    fg = art(False).resize((inner, inner), Image.NEAREST)
    off = (size - inner) // 2
    canvas.alpha_composite(fg, (off, off))
    return canvas


def main():
    out = os.path.join(ROOT, 'icons')
    os.makedirs(out, exist_ok=True)
    scaled(192).save(os.path.join(out, 'icon-192.png'))
    scaled(512).save(os.path.join(out, 'icon-512.png'))
    scaled(512, 0.12).save(os.path.join(out, 'icon-maskable-512.png'))
    scaled(180).convert('RGB').save(os.path.join(out, 'apple-touch-icon.png'))
    if len(sys.argv) > 1:
        res = sys.argv[1]
        for name, px in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
            d = os.path.join(res, 'mipmap-' + name)
            os.makedirs(d, exist_ok=True)
            scaled(px).save(os.path.join(d, 'ic_launcher.png'))
            # 自適應圖示的前景：108dp 畫布，內容放中間 66dp 的安全區
            fg = scaled(px * 108 // 48, 0.2, bg=False)
            fg.save(os.path.join(d, 'ic_launcher_fg.png'))
    print('ok')


if __name__ == '__main__':
    main()
