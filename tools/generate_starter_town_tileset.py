from __future__ import annotations

import json
import math
import random
import shutil
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
MAP_DIR = ROOT / "web-client" / "public" / "maps" / "starter_town"
TILESET_PATH = MAP_DIR / "tileset.png"
BACKUP_PATH = MAP_DIR / "tileset-source-debug.png"
METADATA_PATH = MAP_DIR / "tileset-phaser-metadata.json"

TILE_SIZE = 32
COLS = 16
ROWS = 11
TILECOUNT = 168


def clamp_channel(value: int) -> int:
    return max(0, min(255, value))


def adjust(color: tuple[int, int, int, int], amount: int) -> tuple[int, int, int, int]:
    r, g, b, a = color
    return (
        clamp_channel(r + amount),
        clamp_channel(g + amount),
        clamp_channel(b + amount),
        a,
    )


def rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    hex_color = hex_color.lstrip("#")
    return (
        int(hex_color[0:2], 16),
        int(hex_color[2:4], 16),
        int(hex_color[4:6], 16),
        alpha,
    )


def new_tile(color: tuple[int, int, int, int] = (0, 0, 0, 0)) -> Image.Image:
    return Image.new("RGBA", (TILE_SIZE, TILE_SIZE), color)


def sprinkle(
    image: Image.Image,
    rng: random.Random,
    palette: list[tuple[int, int, int, int]],
    count: int,
    size_range: tuple[int, int] = (1, 2),
) -> None:
    draw = ImageDraw.Draw(image)
    for _ in range(count):
        color = palette[rng.randrange(len(palette))]
        size = rng.randint(size_range[0], size_range[1])
        x = rng.randint(0, TILE_SIZE - size)
        y = rng.randint(0, TILE_SIZE - size)
        draw.rectangle((x, y, x + size - 1, y + size - 1), fill=color)


def terrain_tile(
    rng: random.Random,
    base: tuple[int, int, int, int],
    accent: tuple[int, int, int, int],
    shadow: tuple[int, int, int, int],
) -> Image.Image:
    image = new_tile(base)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, TILE_SIZE - 1, 2), fill=adjust(base, 9))
    draw.rectangle((0, TILE_SIZE - 4, TILE_SIZE - 1, TILE_SIZE - 1), fill=shadow)
    sprinkle(image, rng, [accent, adjust(base, -8), adjust(base, 12)], 64)
    for x in range(0, TILE_SIZE, 4):
        draw.point((x, 0), fill=adjust(base, 14))
    return image


def overlay_rect(
    image: Image.Image,
    x0: int,
    y0: int,
    x1: int,
    y1: int,
    color: tuple[int, int, int, int],
) -> None:
    ImageDraw.Draw(image).rectangle((x0, y0, x1, y1), fill=color)


def quarter_mask_tile(
    rng: random.Random,
    base_tile: Image.Image,
    overlay_tile: Image.Image,
    mask: int,
) -> Image.Image:
    image = base_tile.copy()
    if mask == 15:
        return overlay_tile.copy()
    overlay = overlay_tile.crop((0, 0, TILE_SIZE, TILE_SIZE))
    if mask == 0:
        image.alpha_composite(overlay)
        return image
    half = TILE_SIZE // 2
    if mask & 1:
        image.alpha_composite(overlay.crop((0, 0, TILE_SIZE, half)), (0, 0))
    if mask & 2:
        image.alpha_composite(overlay.crop((half, 0, TILE_SIZE, TILE_SIZE)), (half, 0))
    if mask & 4:
        image.alpha_composite(overlay.crop((0, half, TILE_SIZE, TILE_SIZE)), (0, half))
    if mask & 8:
        image.alpha_composite(overlay.crop((0, 0, half, TILE_SIZE)), (0, 0))
    sprinkle(image, rng, [adjust((40, 40, 40, 255), -10), (0, 0, 0, 0)], 8, (1, 1))
    return image


def inner_corner_tile(base_tile: Image.Image, overlay_tile: Image.Image, corner: str) -> Image.Image:
    image = overlay_tile.copy()
    patch = base_tile.crop((0, 0, TILE_SIZE // 2, TILE_SIZE // 2))
    if corner == "ne":
        patch = base_tile.crop((TILE_SIZE // 2, 0, TILE_SIZE, TILE_SIZE // 2))
        image.alpha_composite(patch, (TILE_SIZE // 2, 0))
    elif corner == "nw":
        image.alpha_composite(patch, (0, 0))
    elif corner == "se":
        patch = base_tile.crop((TILE_SIZE // 2, TILE_SIZE // 2, TILE_SIZE, TILE_SIZE))
        image.alpha_composite(patch, (TILE_SIZE // 2, TILE_SIZE // 2))
    else:
        patch = base_tile.crop((0, TILE_SIZE // 2, TILE_SIZE // 2, TILE_SIZE))
        image.alpha_composite(patch, (0, TILE_SIZE // 2))
    return image


def tree_tile(kind: str, part: str) -> Image.Image:
    image = new_tile()
    draw = ImageDraw.Draw(image)
    if part == "base":
        bark = rgba("#6e4324")
        draw.rounded_rectangle((11, 10, 20, 31), radius=2, fill=bark, outline=adjust(bark, -18))
        draw.rectangle((13, 4, 18, 12), fill=adjust(bark, 16))
        return image
    if kind == "oak":
        leaf = rgba("#4e8c3f")
        shade = rgba("#356b2f")
        circles = [(4, 8, 18, 22), (13, 4, 28, 18), (10, 12, 27, 27), (1, 13, 15, 27)]
        for box in circles:
            draw.ellipse(box, fill=leaf, outline=shade)
        draw.ellipse((10, 7, 24, 20), fill=adjust(leaf, 18))
    elif kind == "pine":
        leaf = rgba("#3f7b45")
        shade = rgba("#2b5c31")
        for top in (4, 9, 14):
            draw.polygon(((16, top), (4, top + 10), (28, top + 10)), fill=leaf, outline=shade)
        draw.rectangle((13, 21, 18, 31), fill=rgba("#6e4324"))
    else:
        leaf = rgba("#5f9448")
        shade = rgba("#3d6734")
        draw.ellipse((5, 6, 26, 22), fill=leaf, outline=shade)
        draw.rectangle((13, 18, 18, 31), fill=rgba("#6e4324"))
    return image


def rock_tile(rng: random.Random, tone: str) -> Image.Image:
    image = new_tile()
    draw = ImageDraw.Draw(image)
    base = rgba("#8e8f91") if tone == "stone" else rgba("#909183")
    shade = adjust(base, -28)
    light = adjust(base, 18)
    points = [(6, 24), (10, 12), (17, 8), (25, 11), (28, 19), (23, 27), (12, 28)]
    draw.polygon(points, fill=base, outline=shade)
    draw.polygon(((11, 16), (17, 11), (23, 15), (18, 18)), fill=light)
    sprinkle(image, rng, [light, shade], 12)
    return image


def bush_tile(rng: random.Random, tint: int) -> Image.Image:
    image = new_tile()
    draw = ImageDraw.Draw(image)
    leaf = adjust(rgba("#4f9343"), tint)
    shade = adjust(leaf, -24)
    circles = [(3, 15, 15, 27), (10, 10, 23, 24), (16, 14, 29, 27)]
    for box in circles:
        draw.ellipse(box, fill=leaf, outline=shade)
    sprinkle(image, rng, [adjust(leaf, 16), shade], 12)
    return image


def log_tile(vertical: bool) -> Image.Image:
    image = new_tile()
    draw = ImageDraw.Draw(image)
    wood = rgba("#7e5330")
    line = adjust(wood, -20)
    if vertical:
        draw.rounded_rectangle((12, 3, 20, 29), radius=4, fill=wood, outline=line)
        draw.ellipse((12, 1, 20, 8), fill=adjust(wood, 12), outline=line)
    else:
        draw.rounded_rectangle((3, 12, 29, 20), radius=4, fill=wood, outline=line)
        draw.ellipse((1, 12, 8, 20), fill=adjust(wood, 12), outline=line)
        draw.ellipse((24, 12, 31, 20), fill=adjust(wood, 6), outline=line)
    return image


def wall_tile(kind: str) -> Image.Image:
    image = new_tile(rgba("#d7c2a1") if kind == "plaster" else rgba("#9f9fa0"))
    draw = ImageDraw.Draw(image)
    if kind == "stone":
        for y in range(0, TILE_SIZE, 8):
            offset = 0 if (y // 8) % 2 == 0 else 6
            for x in range(-offset, TILE_SIZE, 12):
                draw.rectangle((x, y, x + 10, y + 7), outline=rgba("#757577"))
    elif kind == "window":
        wall = wall_tile("plaster")
        draw = ImageDraw.Draw(wall)
        draw.rectangle((8, 8, 23, 25), fill=rgba("#6fa9e8"), outline=rgba("#4e6b84"))
        draw.line((15, 8, 15, 25), fill=rgba("#d7c2a1"))
        draw.line((8, 16, 23, 16), fill=rgba("#d7c2a1"))
        return wall
    elif kind == "door":
        wall = wall_tile("stone")
        draw = ImageDraw.Draw(wall)
        draw.rounded_rectangle((10, 7, 21, 31), radius=3, fill=rgba("#6f472a"), outline=rgba("#4b2f1b"))
        draw.ellipse((17, 18, 19, 20), fill=rgba("#dfc275"))
        return wall
    elif kind == "corner_l":
        draw.rectangle((0, 0, 15, 31), fill=rgba("#9f9fa0"))
        draw.rectangle((16, 0, 31, 31), fill=rgba("#d7c2a1"))
    elif kind == "corner_r":
        draw.rectangle((0, 0, 15, 31), fill=rgba("#d7c2a1"))
        draw.rectangle((16, 0, 31, 31), fill=rgba("#9f9fa0"))
    return image


def roof_tile(color_name: str, part: str) -> Image.Image:
    image = new_tile()
    draw = ImageDraw.Draw(image)
    base = rgba("#b65f56") if color_name == "red" else rgba("#5f7fc4")
    dark = adjust(base, -26)
    light = adjust(base, 18)
    if part == "center":
        draw.rectangle((0, 0, 31, 31), fill=base)
        for y in range(4, 32, 6):
            draw.line((0, y, 31, y), fill=dark)
            draw.line((0, y + 1, 31, y + 1), fill=light)
    elif part == "ridge":
        draw.polygon(((0, 10), (16, 2), (31, 10), (31, 18), (0, 18)), fill=base, outline=dark)
        draw.line((16, 2, 16, 18), fill=light)
    elif part == "edge_l":
        draw.polygon(((0, 12), (20, 2), (31, 6), (31, 31), (0, 31)), fill=base, outline=dark)
    elif part == "edge_r":
        draw.polygon(((0, 6), (11, 2), (31, 12), (31, 31), (0, 31)), fill=base, outline=dark)
    else:
        draw.polygon(((2, 28), (16, 4), (29, 28)), fill=base, outline=dark)
        draw.line((16, 4, 16, 28), fill=light)
    return image


def fence_tile(kind: str) -> Image.Image:
    image = new_tile()
    draw = ImageDraw.Draw(image)
    wood = rgba("#8c6139")
    line = adjust(wood, -26)
    if kind == "h":
        for y in (11, 19):
            draw.rectangle((3, y, 28, y + 3), fill=wood)
        for x in (6, 16, 26):
            draw.rectangle((x, 7, x + 2, 25), fill=wood, outline=line)
    elif kind == "v":
        for x in (11, 19):
            draw.rectangle((x, 3, x + 3, 28), fill=wood)
        for y in (6, 16, 26):
            draw.rectangle((7, y, 25, y + 2), fill=wood, outline=line)
    elif kind == "post":
        draw.rectangle((13, 4, 18, 27), fill=wood, outline=line)
        draw.polygon(((11, 6), (16, 1), (21, 6)), fill=adjust(wood, 12))
    else:
        image = fence_tile("h")
        draw = ImageDraw.Draw(image)
        draw.rectangle((12, 11, 19, 22), fill=(0, 0, 0, 0))
        return image
    return image


def object_tile(kind: str) -> Image.Image:
    image = new_tile()
    draw = ImageDraw.Draw(image)
    if kind == "well_base":
        draw.ellipse((5, 18, 26, 29), fill=rgba("#707880"))
        draw.rectangle((8, 10, 23, 24), fill=rgba("#8f989f"), outline=rgba("#596066"))
        draw.ellipse((10, 12, 21, 18), fill=rgba("#5ba0cf"))
    elif kind == "well_top":
        draw.line((8, 8, 8, 28), fill=rgba("#6f472a"), width=3)
        draw.line((24, 8, 24, 28), fill=rgba("#6f472a"), width=3)
        draw.polygon(((4, 10), (16, 2), (28, 10)), fill=rgba("#a8574d"), outline=rgba("#6f322a"))
    elif kind.startswith("sign"):
        draw.rectangle((12, 16, 18, 31), fill=rgba("#6f472a"))
        draw.rounded_rectangle((6, 5, 25, 17), radius=2, fill=rgba("#c8a56b"), outline=rgba("#7a5b34"))
        if kind == "sign_tavern":
            draw.rectangle((10, 8, 20, 14), fill=rgba("#8d4c2e"))
        elif kind == "sign_shop":
            draw.rectangle((9, 7, 22, 15), fill=rgba("#4e6bb0"))
    elif kind.startswith("cave"):
        draw.pieslice((3, 5, 29, 33), 180, 360, fill=rgba("#535355"), outline=rgba("#2e2f31"))
        draw.pieslice((8, 11, 24, 31), 180, 360, fill=rgba("#181616"))
        if kind == "cave_l":
            draw.rectangle((0, 0, 10, 31), fill=(0, 0, 0, 0))
        else:
            draw.rectangle((21, 0, 31, 31), fill=(0, 0, 0, 0))
    elif kind == "barrel":
        draw.rounded_rectangle((9, 6, 22, 28), radius=4, fill=rgba("#8b5d33"), outline=rgba("#58371c"))
        for y in (11, 17, 23):
            draw.line((9, y, 22, y), fill=rgba("#b5834f"))
    elif kind == "crate":
        draw.rectangle((7, 8, 24, 25), fill=rgba("#8e6338"), outline=rgba("#55361b"))
        draw.line((7, 8, 24, 25), fill=rgba("#c59a63"))
        draw.line((24, 8, 7, 25), fill=rgba("#c59a63"))
    elif kind == "bench_l":
        draw.rectangle((4, 18, 15, 21), fill=rgba("#8e6338"))
        draw.rectangle((5, 22, 7, 29), fill=rgba("#6f472a"))
        draw.rectangle((12, 22, 14, 29), fill=rgba("#6f472a"))
    elif kind == "bench_r":
        draw.rectangle((16, 18, 27, 21), fill=rgba("#8e6338"))
        draw.rectangle((17, 22, 19, 29), fill=rgba("#6f472a"))
        draw.rectangle((24, 22, 26, 29), fill=rgba("#6f472a"))
    elif kind == "torch_base":
        draw.rectangle((14, 10, 17, 30), fill=rgba("#4b3a2c"))
        draw.ellipse((11, 6, 20, 14), fill=rgba("#d18d43"))
    elif kind.startswith("fire_"):
        base = object_tile("torch_base")
        draw = ImageDraw.Draw(base)
        jitter = {"fire_0": 0, "fire_1": 2, "fire_2": -2}[kind]
        draw.polygon(((16, 6 + jitter), (10, 20), (16, 18), (21, 24), (23, 15)), fill=rgba("#ffb347"))
        draw.polygon(((16, 10 + jitter), (13, 20), (16, 17), (19, 20)), fill=rgba("#ffef8a"))
        return base
    elif kind == "lantern":
        draw.rectangle((13, 7, 18, 24), fill=rgba("#6f472a"))
        draw.ellipse((10, 10, 21, 21), fill=rgba("#f0d27c"), outline=rgba("#7f6835"))
        draw.arc((12, 3, 18, 10), 180, 360, fill=rgba("#6f472a"))
    return image


def collision_tile(kind: str) -> Image.Image:
    color = {
        "collision_full": rgba("#d64c4c", 110),
        "collision_half": rgba("#e2a33c", 110),
        "collision_water": rgba("#3a7fd7", 110),
    }[kind]
    image = new_tile((0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 31, 31), fill=color, outline=adjust(color, 28))
    return image


def compose_tiles() -> tuple[Image.Image, dict]:
    with METADATA_PATH.open("r", encoding="utf-8") as handle:
        existing = json.load(handle)

    ordered_names = [
        name
        for name, entry in sorted(existing["tiles"].items(), key=lambda item: item[1]["gid"])
        if entry["gid"] <= TILECOUNT
    ]
    atlas = Image.new("RGBA", (COLS * TILE_SIZE, ROWS * TILE_SIZE), (0, 0, 0, 0))
    metadata_tiles: dict[str, dict[str, int]] = {}

    rng = random.Random(9127)
    grass_light = [terrain_tile(random.Random(100 + i), rgba("#84c55b"), rgba("#9ddb6e"), rgba("#5f9345")) for i in range(4)]
    grass_dark = [terrain_tile(random.Random(200 + i), rgba("#5a9642"), rgba("#75b155"), rgba("#3d6d2f")) for i in range(4)]
    dirt = [terrain_tile(random.Random(300 + i), rgba("#9f7a4e"), rgba("#b98d5e"), rgba("#755733")) for i in range(4)]
    road = [terrain_tile(random.Random(400 + i), rgba("#8f8e8a"), rgba("#b1afa9"), rgba("#66655f")) for i in range(4)]
    forest = [terrain_tile(random.Random(500 + i), rgba("#42592f"), rgba("#59753e"), rgba("#2d3e20")) for i in range(4)]
    water = []
    for i in range(3):
        tile = new_tile(rgba("#58a7e8"))
        draw = ImageDraw.Draw(tile)
        for y in range(0, TILE_SIZE, 4):
            wave = (i * 3 + y) % 8
            draw.line((0, y + wave // 2, TILE_SIZE, y + wave // 2), fill=rgba("#8fd2ff"))
        sprinkle(tile, random.Random(600 + i), [rgba("#3a86cf"), rgba("#94ddff")], 28)
        water.append(tile)

    terrain_lookup = {
        "grass_light": grass_light,
        "grass_dark": grass_dark,
        "dirt": dirt,
        "road": road,
        "forest_floor": forest,
        "water": water,
    }

    for gid, name in enumerate(ordered_names, start=1):
        tile_rng = random.Random(1000 + gid)
        if name.startswith("dark_on_light_mask_"):
            tile = quarter_mask_tile(tile_rng, grass_light[gid % 4], grass_dark[(gid + 1) % 4], int(name.rsplit("_", 1)[1]))
        elif name.startswith("dark_on_light_inner_"):
            tile = inner_corner_tile(grass_light[0], grass_dark[1], name.split("_")[-1])
        elif name.startswith("dirt_on_grass_mask_"):
            tile = quarter_mask_tile(tile_rng, grass_light[(gid + 1) % 4], dirt[gid % 4], int(name.rsplit("_", 1)[1]))
        elif name.startswith("dirt_on_grass_inner_"):
            tile = inner_corner_tile(grass_light[2], dirt[1], name.split("_")[-1])
        elif name.startswith("road_on_dirt_mask_"):
            tile = quarter_mask_tile(tile_rng, dirt[(gid + 2) % 4], road[gid % 4], int(name.rsplit("_", 1)[1]))
        elif name.startswith("road_on_dirt_inner_"):
            tile = inner_corner_tile(dirt[0], road[2], name.split("_")[-1])
        elif name.startswith("forest_on_dark_mask_"):
            tile = quarter_mask_tile(tile_rng, grass_dark[(gid + 3) % 4], forest[gid % 4], int(name.rsplit("_", 1)[1]))
        elif name.startswith("forest_on_dark_inner_"):
            tile = inner_corner_tile(grass_dark[0], forest[1], name.split("_")[-1])
        elif name.startswith("grass_light"):
            tile = grass_light[int(name.rsplit("_", 1)[1])]
        elif name.startswith("grass_dark"):
            tile = grass_dark[int(name.rsplit("_", 1)[1])]
        elif name.startswith("dirt_"):
            tile = dirt[int(name.rsplit("_", 1)[1])]
        elif name.startswith("road_"):
            tile = road[int(name.rsplit("_", 1)[1])]
        elif name.startswith("forest_floor"):
            tile = forest[int(name.rsplit("_", 1)[1])]
        elif name.startswith("water_"):
            tile = water[int(name.rsplit("_", 1)[1])]
        elif name.startswith("tree_oak_top_"):
            tile = tree_tile("oak", "top")
        elif name.startswith("tree_oak_base_"):
            tile = tree_tile("oak", "base")
        elif name.startswith("tree_pine_top_"):
            tile = tree_tile("pine", "top")
        elif name.startswith("tree_pine_base_"):
            tile = tree_tile("pine", "base")
        elif name == "tree_small_top":
            tile = tree_tile("small", "top")
        elif name == "tree_small_base":
            tile = tree_tile("small", "base")
        elif name.startswith("leaf_litter_"):
            tile = grass_dark[int(name.rsplit("_", 1)[1])].copy()
            sprinkle(tile, tile_rng, [rgba("#8b5a2b"), rgba("#b7824a"), rgba("#678d4d")], 30)
        elif name.startswith("bush_"):
            tile = bush_tile(tile_rng, int(name.rsplit("_", 1)[1]) * 6)
        elif name.startswith("rock_"):
            tile = rock_tile(tile_rng, "stone")
        elif name == "log_h":
            tile = log_tile(False)
        elif name == "log_v":
            tile = log_tile(True)
        elif name == "wall_plaster":
            tile = wall_tile("plaster")
        elif name == "wall_stone":
            tile = wall_tile("stone")
        elif name == "wall_window":
            tile = wall_tile("window")
        elif name == "wall_door":
            tile = wall_tile("door")
        elif name == "wall_corner_l":
            tile = wall_tile("corner_l")
        elif name == "wall_corner_r":
            tile = wall_tile("corner_r")
        elif name.startswith("roof_red_"):
            tile = roof_tile("red", name.replace("roof_red_", ""))
        elif name.startswith("roof_blue_"):
            tile = roof_tile("blue", name.replace("roof_blue_", ""))
        elif name == "fence_h":
            tile = fence_tile("h")
        elif name == "fence_v":
            tile = fence_tile("v")
        elif name == "fence_post":
            tile = fence_tile("post")
        elif name == "fence_gate":
            tile = fence_tile("gate")
        elif name in {"well_base", "well_top", "sign_blank", "sign_tavern", "sign_shop", "cave_l", "cave_r", "barrel", "crate", "bench_l", "bench_r", "torch_base", "fire_0", "fire_1", "fire_2", "lantern"}:
            tile = object_tile(name)
        elif name.startswith("collision_"):
            tile = collision_tile(name)
        else:
            tile = terrain_tile(tile_rng, rgba("#b05ac7"), rgba("#d88cf0"), rgba("#733b87"))

        column = (gid - 1) % COLS
        row = (gid - 1) // COLS
        atlas.alpha_composite(tile, (column * TILE_SIZE, row * TILE_SIZE))
        metadata_tiles[name] = {"gid": gid, "id": gid - 1, "column": column, "row": row}

    metadata = {
        "image": "tileset.png",
        "tileWidth": TILE_SIZE,
        "tileHeight": TILE_SIZE,
        "columns": COLS,
        "rows": ROWS,
        "tilecount": TILECOUNT,
        "engineSafeTilecount": TILECOUNT,
        "phaserIndexBase": 1,
        "tiles": metadata_tiles,
    }
    return atlas, metadata


def main() -> None:
    if not BACKUP_PATH.exists() and TILESET_PATH.exists():
        shutil.copyfile(TILESET_PATH, BACKUP_PATH)

    atlas, metadata = compose_tiles()
    atlas.save(TILESET_PATH)
    with METADATA_PATH.open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, ensure_ascii=True, indent=2)
        handle.write("\n")
    print(f"generated {TILESET_PATH} ({atlas.size[0]}x{atlas.size[1]})")


if __name__ == "__main__":
    main()
