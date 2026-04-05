#!/usr/bin/env python3
"""
build-sprite-atlas.py
Packs individual v2 character PNGs into per-character sprite atlases.

Each atlas arranges frames horizontally in a fixed order:
  [idle-south, idle-east, idle-north, idle-west,
   walk-south-0..3, walk-east-0..3, walk-north-0..3, walk-west-0..3,
   celebrate-south-0..N,
   (waffles only) excited-south-0..3, excited-east-0..3, excited-north-0..3, excited-west-0..3]

Output:
  public/sprites/atlas/{charId}.png   - sprite atlas image
  public/sprites/atlas/{charId}.json  - frame metadata

Usage:
  python scripts/build-sprite-atlas.py
"""

import json
import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("ERROR: Pillow is required. Install with: pip install Pillow")
    sys.exit(1)

# Config
FRAME_SIZE = 180  # each source PNG is 180x180
DIRS = ["south", "east", "north", "west"]
WALK_FRAMES = 4

CELEBRATE_FRAME_COUNTS = {
    "boss": 4, "secretary": 4, "sherlock": 4, "lego": 4,
    "vault": 4, "forge": 4, "lens": 4, "waffles": 4,
    "mika": 7, "yuki": 7, "grant": 4,
}

CHARACTERS = list(CELEBRATE_FRAME_COUNTS.keys())

def build_frame_list(char_id: str) -> list[dict]:
    """Build ordered list of frames with their source filenames and atlas keys."""
    frames = []

    # Idle: 4 directions
    for d in DIRS:
        frames.append({
            "key": f"v2-{char_id}-{d}",
            "file": f"{d}.png",
        })

    # Walk: 4 directions x 4 frames
    for d in DIRS:
        for f in range(WALK_FRAMES):
            frames.append({
                "key": f"v2-{char_id}-walk-{d}-{f}",
                "file": f"walk-{d}-{f}.png",
            })

    # Celebrate: south only
    cel_count = CELEBRATE_FRAME_COUNTS.get(char_id, 4)
    for f in range(cel_count):
        frames.append({
            "key": f"v2-{char_id}-celebrate-south-{f}",
            "file": f"celebrate-south-{f}.png",
        })

    # Waffles excited: 4 directions x 4 frames
    if char_id == "waffles":
        for d in DIRS:
            for f in range(4):
                frames.append({
                    "key": f"v2-waffles-excited-{d}-{f}",
                    "file": f"excited-{d}-{f}.png",
                })

    return frames


def build_atlas(char_id: str, sprites_dir: Path, output_dir: Path) -> bool:
    """Build atlas for one character. Returns True on success."""
    char_dir = sprites_dir / "v2" / char_id
    if not char_dir.is_dir():
        print(f"  SKIP {char_id}: directory not found at {char_dir}")
        return False

    frames = build_frame_list(char_id)
    total = len(frames)

    # Create atlas: horizontal strip
    atlas_w = FRAME_SIZE * total
    atlas_h = FRAME_SIZE
    atlas = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))

    metadata = {
        "frameSize": FRAME_SIZE,
        "totalFrames": total,
        "frames": {},
    }

    missing = []
    for i, frame_info in enumerate(frames):
        src_path = char_dir / frame_info["file"]
        x = i * FRAME_SIZE
        if src_path.exists():
            img = Image.open(src_path)
            # Ensure correct size
            if img.size != (FRAME_SIZE, FRAME_SIZE):
                img = img.resize((FRAME_SIZE, FRAME_SIZE), Image.LANCZOS)
            atlas.paste(img, (x, 0))
        else:
            missing.append(frame_info["file"])

        metadata["frames"][frame_info["key"]] = {
            "x": x,
            "y": 0,
            "w": FRAME_SIZE,
            "h": FRAME_SIZE,
        }

    if missing:
        print(f"  WARNING {char_id}: missing {len(missing)} files: {missing[:5]}...")

    # Save atlas PNG
    output_dir.mkdir(parents=True, exist_ok=True)
    atlas_path = output_dir / f"{char_id}.png"
    atlas.save(atlas_path, "PNG", optimize=True)

    # Save metadata JSON
    json_path = output_dir / f"{char_id}.json"
    with open(json_path, "w") as f:
        json.dump(metadata, f, indent=2)

    file_size_kb = atlas_path.stat().st_size / 1024
    print(f"  OK {char_id}: {total} frames, {atlas_w}x{atlas_h}px, {file_size_kb:.1f}KB")
    return True


def main():
    project_root = Path(__file__).resolve().parent.parent
    sprites_dir = project_root / "public" / "sprites"
    output_dir = sprites_dir / "atlas"

    print(f"Building sprite atlases...")
    print(f"Source: {sprites_dir / 'v2'}")
    print(f"Output: {output_dir}")
    print()

    success = 0
    for char_id in CHARACTERS:
        if build_atlas(char_id, sprites_dir, output_dir):
            success += 1

    print(f"\nDone: {success}/{len(CHARACTERS)} atlases built.")

    # Summary: total file count reduction
    individual_pngs = sum(len(build_frame_list(c)) for c in CHARACTERS)
    print(f"HTTP requests: {individual_pngs} individual PNGs -> {success} atlas PNGs + {success} JSON = {success * 2} files")


if __name__ == "__main__":
    main()
