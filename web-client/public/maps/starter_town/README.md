# Starter Town Tileset Manifest

- Tile size: 32x32
- Margin: 0
- Spacing: 0
- Tileset name in Tiled JSON: `tiles`

## Collision Tile IDs (GID)
- `collision_full`: 166
- `collision_half`: 167
- `collision_water`: 168

## Animated Tiles (GID)
- `water_0` (3 frames): 21
- `fire_0` (3 frames): 162

## Phaser 3
```ts
this.load.tilemapTiledJSON('map', '/maps/starter_town/map.json');
this.load.image('tiles', '/maps/starter_town/tileset.png');
const map = this.make.tilemap({ key: 'map' });
const tileset = map.addTilesetImage('tiles', 'tiles');
map.createLayer('ground', tileset!);
map.createLayer('ground_details', tileset!);
map.createLayer('objects', tileset!);
map.createLayer('buildings_base', tileset!);
const top1 = map.createLayer('buildings_top', tileset!);
const top2 = map.createLayer('nature_top', tileset!);
const col = map.createLayer('collision', tileset!);
col?.setVisible(false);
col?.setCollisionByExclusion([-1, 0]);
top1?.setDepth(1000);
top2?.setDepth(1000);
```