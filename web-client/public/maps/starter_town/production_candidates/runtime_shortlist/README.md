# Runtime Shortlist

This package contains renamed production candidates from the 04 pass and a smaller runtime shortlist for safe promotion tests.

## Renamed assets
- Total renamed assets: 35
- Naming style favors runtime-friendly identifiers over original extraction ids.
- Confidence values indicate how certain the asset identity is from the generated sheet.

## Runtime shortlist
- Total shortlist assets: 24
- By category: building=5, large_prop=11, prop=8
- This shortlist keeps the cleanest and most readable houses, signs, fences, lights, storage props, and blacksmith set pieces.

## Suggested promotion order
1. Houses, cave, well, fences, torches
2. Crates, barrels, bench, signboards
3. Smithing props like anvil and weapon rack

## Notes
- Lower-confidence renamed assets stay in `props_buildings/renamed` but are excluded from the first runtime pass.
- This step does not modify the live tileset atlas yet.