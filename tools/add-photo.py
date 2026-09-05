#!/usr/bin/env python3
"""Strip a JPEG down to what it shows, and drop it where the site looks for it.

The repo is public. A photo straight off a phone carries EXIF, and EXIF carries
the GPS fix of wherever it was taken, the device, and the timestamp. For photos
of where our equipment lives, that is a location log we would be publishing by
accident.

This removes EVERY APPn marker — not just the GPS block — because Exif, XMP,
Photoshop IRB and the maker notes all ride in different ones and each has held a
location or a serial number at some point. What survives is the image data.

The site names photos by slug: `photos:['squad-car']` reads assets/bags/squad-car.jpg,
and the caption under it is that slug with the dashes turned into spaces. So the
slug has to describe what is actually in the frame — a wrong name is a visible
lie, not just untidy.

    python3 tools/add-photo.py ~/Desktop/car.jpg bags squad-car
"""
import sys, os, pathlib

def strip(data):
    if data[:2] != b'\xff\xd8':
        raise SystemExit('not a JPEG (no SOI marker) — convert it first')
    out, i, dropped = bytearray(b'\xff\xd8'), 2, []
    while i < len(data):
        if data[i] != 0xFF:
            out += data[i:]; break
        m = data[i+1]
        if m == 0xD9:                       # end of image
            out += data[i:]; break
        if m == 0xDA:                       # start of scan: the pixels follow
            out += data[i:]; break
        seg = int.from_bytes(data[i+2:i+4], 'big')
        if 0xE0 <= m <= 0xEF or m == 0xFE:  # APPn and COM
            dropped.append('APP%d' % (m - 0xE0) if m != 0xFE else 'COM')
        else:
            out += data[i:i+2+seg]
        i += 2 + seg
    return bytes(out), dropped

def main():
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    src, kind, slug = sys.argv[1], sys.argv[2], sys.argv[3]
    if kind not in ('bags', 'rooms'):
        raise SystemExit('second argument must be "bags" or "rooms"')
    if slug != slug.lower().strip('-') or ' ' in slug or '_' in slug:
        raise SystemExit('slug must be lowercase-with-dashes — it becomes the caption')
    repo = pathlib.Path(__file__).resolve().parent.parent
    dst = repo / 'assets' / kind / (slug + '.jpg')
    raw = pathlib.Path(src).expanduser().read_bytes()
    clean, dropped = strip(raw)
    dst.write_bytes(clean)
    print('wrote %s  (%.0f KB -> %.0f KB)' % (dst.relative_to(repo), len(raw)/1024, len(clean)/1024))
    print('dropped: ' + (', '.join(dropped) if dropped else 'nothing — it was already clean'))
    left = [s for s in (b'Exif', b'http://ns.adobe.com/xap', b'GPS', b'ICC_PROFILE') if s in clean]
    print('re-scan: ' + ('STILL PRESENT ' + str(left) if left else 'no Exif, XMP, GPS or ICC left'))
    print('\nnow add %r to that entry\'s photos:[] in index.html' % slug)

main()
