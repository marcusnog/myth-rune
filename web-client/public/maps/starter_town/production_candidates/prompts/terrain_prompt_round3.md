# Starter Town Terrain Prompt Round 3

## Tipo de asset
`terrain_tileset`

## Direcao visual
Create a strict production-ready terrain atlas for Myth Rune starter town, matching a handcrafted 2D fantasy MMORPG look, top-down slight isometric MMO perspective, warm golden light from above, readable material separation, and crisp game-asset behavior instead of decorative composition.

## Prompt final
```text
Create exactly one engine-ready 2D fantasy MMORPG terrain tileset atlas for the Myth Rune starter town map.

This must be a real terrain atlas for slicing in Tiled/Phaser, not concept art, not a mockup sheet, not a scene collage, and not a patchwork preview.

Hard technical requirements:
- exact final image size: 512x352 pixels
- exact grid: 16 columns x 11 rows
- every tile is exactly 32x32 pixels
- no visible grid lines
- no labels
- no text
- no logos
- no decorative framing
- no blank placeholder cells
- no white filler cells
- no checkerboard
- no cut-off fragments that depend on neighboring illustration context
- no props, no buildings, no trees, no giant canopies, no fence pieces
- terrain only

Visual style:
- handcrafted classic 2D browser MMORPG
- top-down slight isometric map perspective
- warm golden light from above
- readable shapes first, detail second
- vibrant but controlled palette
- crisp material edges
- cleaner and more game-readable than painterly mobile concept art
- no photorealism
- no glossy rendering
- no watercolor softness
- no painterly smearing across tiles

Required terrain families:
- light grass base variants
- darker grass variants
- village dirt variants
- pale stone road variants
- dark forest floor variants
- shallow water variants
- shoreline transitions
- grass-to-dirt transitions
- dirt-to-road transitions
- grass-to-road transitions
- dark-grass / forest transitions
- inner corners
- outer corners
- straight edges
- turn pieces
- junction-friendly transitions

Critical semantic rule:
Every tile must behave like an individual reusable tile, not like one cropped portion of a large painted scene. Do not paint a pond, road, or clearing across many cells as one illustration. Each 32x32 tile must make sense on its own and connect seamlessly with adjacent tiles in gameplay.

Water rules:
- shallow blue water only
- top-down readable
- subtle surface variation
- no giant single pond painted across many cells
- each water tile must tile seamlessly

Road rules:
- stone roads must read as modular road tiles
- dirt paths must read as modular path tiles
- do not embed long precomposed road shapes across multiple cells

Transition rules:
- transitions must look like real tile masks
- include readable corners and edges
- avoid oversized blended gradients spanning many cells
- each transition tile must be reusable in different map layouts

Negative constraints:
- no mixed terrain and props
- no trees inside terrain cells
- no building shadows
- no giant precomposed map chunks
- no scene thumbnails
- no presentation board layout
- no transparent cutout artifacts
- no white square artifacts
- no blank cells

Deliver exactly one finished PNG atlas that is ready to slice on a 32x32 grid and map directly in the starter_town tileset pipeline.
```

## Variacao
```text
Create the same exact 512x352, 16x11, 32x32 Myth Rune starter-town terrain atlas, but make it slightly more classic-RPG and less softly blended: stronger tile readability, cleaner corners, clearer road blocks, more disciplined shoreline tiles, and more obvious reusable transition masks. Keep terrain only, no props, no trees, and no scene-style painting across multiple cells.
```

## Observacoes de integracao
- Target family: `web-client/public/maps/starter_town/tileset.png`
- Runtime expects `32x32` terrain tiles.
- This pass should only solve terrain semantics.
- Props and buildings should remain in a separate sheet such as `nanobanana_props/props_buildings_atlas.png`.
- Reject any output that includes precomposed terrain chunks, visible white blanks, or non-modular roads/water.
