# Production Candidates

This folder contains the current curated production candidates for Myth Rune starter town.

## Primary direction
- Terrain base: use the 04 safe hybrid first.
- Props/buildings: prefer curated extracted assets from the 04 sheet.
- Trees/foliage and resources: use 02 reference blocks for the next dedicated generation or extraction pass.

## Package contents
- `terrain/primary`: current best terrain candidates.
- `terrain/fallback`: fallback terrain candidates from earlier rounds.
- `terrain/reference`: terrain reference blocks for further prompting.
- `props_buildings/primary`: selected extracted assets from 04 ready for manual naming and promotion.
- `props_buildings/fallback_atlases`: full atlases kept as backup/reference.
- `trees_foliage/reference`: current foliage reference block from 02.
- `resources/reference`: current resource reference block from 02.
- `prompts`: prompting material that still matters for the next image-generation pass.

## Selection summary
- Primary 04 extracted selections: 35
- By category: large_prop=15, building=5, prop=15

## Recommended next step
- Rename the selected 04 props/buildings by function (`house_small`, `well`, `torch`, `crate`, etc).
- Promote only the hand-checked winners into the runtime atlas.
- Keep trees/resources in a separate pass to avoid overloading the starter_town tileset semantics.
