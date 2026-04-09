from __future__ import annotations

from pathlib import Path
from typing import Iterable

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "wolf.png"
OUTPUT_PATH = ROOT / "web-client" / "public" / "sprites" / "mobs" / "wolf" / "wolf_sprite_sheet.png"

FRAME_SIZE = 128
COLUMNS = 8
ROWS = 8
BOTTOM_PADDING = 24
BLACK_THRESHOLD = 10


def to_transparent(sprite: Image.Image) -> Image.Image:
    sprite = sprite.convert("RGBA")
    cleaned: list[tuple[int, int, int, int]] = []
    for y in range(sprite.height):
        for x in range(sprite.width):
            red, green, blue, alpha = sprite.getpixel((x, y))
            if alpha == 0 or (
                red <= BLACK_THRESHOLD
                and green <= BLACK_THRESHOLD
                and blue <= BLACK_THRESHOLD
            ):
                cleaned.append((0, 0, 0, 0))
            else:
                cleaned.append((red, green, blue, alpha))
    sprite.putdata(cleaned)
    bbox = sprite.getbbox()
    return sprite.crop(bbox) if bbox else sprite


def extract_frames(image: Image.Image, boxes: Iterable[tuple[int, int, int, int]], *, flip: bool = False) -> list[Image.Image]:
    frames: list[Image.Image] = []
    for left, top, right, bottom in boxes:
        sprite = to_transparent(image.crop((left, top, right + 1, bottom + 1)))
        if flip:
            sprite = sprite.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        frames.append(sprite)
    return frames


def paste_row(sheet: Image.Image, row_index: int, frames: list[Image.Image]) -> None:
    for column, frame in enumerate(frames[:COLUMNS]):
        frame_x = column * FRAME_SIZE + max(0, (FRAME_SIZE - frame.width) // 2)
        frame_y = row_index * FRAME_SIZE + max(0, FRAME_SIZE - frame.height - BOTTOM_PADDING)
        sheet.alpha_composite(frame, (frame_x, frame_y))


def build_sheet() -> None:
    source = Image.open(SOURCE_PATH).convert("RGBA")

    idle_boxes = [
        (6, 25, 79, 68),
        (91, 25, 158, 68),
        (169, 26, 246, 68),
        (256, 28, 337, 68),
    ]
    walk_boxes = [
        (5, 113, 93, 158),
        (100, 111, 177, 158),
        (184, 110, 257, 158),
        (263, 112, 358, 158),
        (365, 109, 464, 158),
        (471, 110, 566, 158),
        (573, 113, 665, 158),
    ]
    attack_boxes = [
        (7, 204, 100, 254),
        (109, 202, 205, 251),
        (211, 195, 302, 250),
        (308, 198, 397, 247),
        (400, 205, 485, 255),
        (491, 210, 574, 254),
        (582, 212, 668, 255),
    ]
    hurt_boxes = [
        (8, 292, 95, 352),
        (112, 294, 193, 352),
    ]
    death_boxes = [
        (215, 307, 302, 352),
        (318, 319, 423, 351),
        (436, 321, 539, 351),
    ]

    idle_right = extract_frames(source, idle_boxes)
    idle_left = extract_frames(source, idle_boxes, flip=True)
    walk_right = extract_frames(source, walk_boxes)
    walk_left = extract_frames(source, walk_boxes, flip=True)
    attack_right = extract_frames(source, attack_boxes)
    attack_left = extract_frames(source, attack_boxes, flip=True)
    hurt = extract_frames(source, hurt_boxes)
    death = extract_frames(source, death_boxes)

    sheet = Image.new("RGBA", (FRAME_SIZE * COLUMNS, FRAME_SIZE * ROWS), (0, 0, 0, 0))
    paste_row(sheet, 0, idle_right)
    paste_row(sheet, 1, idle_left)
    paste_row(sheet, 2, walk_right)
    paste_row(sheet, 3, walk_left)
    paste_row(sheet, 4, attack_right)
    paste_row(sheet, 5, attack_left)
    paste_row(sheet, 6, hurt)
    paste_row(sheet, 7, death)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT_PATH)
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    build_sheet()
