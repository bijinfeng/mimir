"""Self-generated tiny raster fixtures; no external image assets. Pillow 12.2."""
from pathlib import Path
from PIL import Image
root = Path(__file__).parent
image = Image.new('RGB', (12, 8), '#bc3939')
for y in range(8):
    for x in range(6, 12):
        image.putpixel((x, y), (24, 133, 77))
for ext, fmt in [('png', 'PNG'), ('jpg', 'JPEG'), ('bmp', 'BMP'), ('webp', 'WEBP')]:
    image.save(root / f'picture.{ext}', fmt)
second = Image.new('RGB', (12, 8), '#3167bb')
image.save(root / 'picture.gif', 'GIF', save_all=True, append_images=[second], duration=120, loop=0)
image.save(root / 'animated.webp', 'WEBP', save_all=True, append_images=[second], duration=120, loop=0, lossless=True)
small = Image.new('RGB', (4, 3), '#ffffff')
small.save(root / 'picture.tiff', 'TIFF', save_all=True, append_images=[image], compression='raw')

exif = Image.Exif()
exif[274] = 6
image.save(root / 'orientation-6.jpg', 'JPEG', exif=exif)
