"""
build-gallery.py — turns the full-size camera JPGs in public/gallery/
into web-friendly copies for the /gallery page:

  public/gallery/thumbs/<name>.webp   ~480px  grid tiles
  public/gallery/large/<name>.webp    ~2000px lightbox view
  public/gallery/photos.json          manifest read by gallery.js

Re-run after adding/removing photos:  python scripts/build-gallery.py
(needs Pillow:  pip install pillow). Existing outputs are reused, and
the originals can be deleted afterwards — the manifest is built from
large/, so to remove a photo delete its thumbs/ + large/ copies.
"""
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent / 'public' / 'gallery'
THUMBS, LARGE = ROOT / 'thumbs', ROOT / 'large'
SIZES = ((THUMBS, 480, 72), (LARGE, 2000, 82))  # (dir, long side, quality)
EXTS = {'.jpg', '.jpeg', '.png', '.webp'}

for d, _, _ in SIZES:
    d.mkdir(exist_ok=True)

sources = sorted(p for p in ROOT.iterdir() if p.is_file() and p.suffix.lower() in EXTS)
for i, src in enumerate(sources, 1):
    name = src.stem + '.webp'
    im = None
    for d, side, q in SIZES:
        out = d / name
        if not out.exists():
            if im is None:
                im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
            copy = im.copy()
            copy.thumbnail((side, side), Image.LANCZOS)
            copy.save(out, 'WEBP', quality=q, method=6)
    print(f'[{i}/{len(sources)}] {src.name}')

# Manifest = every photo that has both web copies (originals not required).
photos = []
for large in sorted(LARGE.glob('*.webp')):
    thumb = THUMBS / large.name
    if not thumb.exists():
        continue
    with Image.open(thumb) as t:
        w, h = t.size
    photos.append({'t': f'/gallery/thumbs/{large.name}', 'l': f'/gallery/large/{large.name}', 'w': w, 'h': h})

(ROOT / 'photos.json').write_text(json.dumps(photos, separators=(',', ':')))
print(f'Wrote {len(photos)} photos to photos.json')
