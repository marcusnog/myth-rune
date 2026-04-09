'use strict';

function stampCollision(layers, width, x, y, gid) {
  layers.collision[y * width + x] = gid;
}

function placeProps(context, layers) {
  const placements = [
    { id: 'torch_standing_a', tileX: 61, tileY: 64 },
    { id: 'torch_standing_b', tileX: 67, tileY: 64 },
    { id: 'bench_wood_a', tileX: 60, tileY: 67 },
    { id: 'notice_board_small_a', tileX: 69, tileY: 67, blocker: { width: 18, height: 8, offsetY: -2 }, collision: [69, 67, 167] },
    { id: 'signpost_standing_a', tileX: 58, tileY: 64 },
    { id: 'hanging_sign_small_a', tileX: 66, tileY: 61 },
    { id: 'lantern_hanging_a', tileX: 65, tileY: 61 },
    { id: 'fence_straight_long_a', tileX: 60, tileY: 69, blocker: { width: 44, height: 8, offsetY: -1 } },
    { id: 'fence_straight_short_a', tileX: 65, tileY: 69, blocker: { width: 34, height: 8, offsetY: -1 } },
    { id: 'fence_diagonal_right_a', tileX: 70, tileY: 68, blocker: { width: 20, height: 8, offsetY: -1 } },
    { id: 'crate_single_a', tileX: 70, tileY: 65, blocker: { width: 12, height: 10, offsetY: -1 }, collision: [70, 65, 167] },
    { id: 'crates_stacked_double_a', tileX: 71, tileY: 65, blocker: { width: 18, height: 10, offsetY: -1 }, collision: [71, 65, 167] },
    { id: 'barrel_large_a', tileX: 72, tileY: 65, blocker: { width: 14, height: 10, offsetY: -1 }, collision: [72, 65, 167] },
    { id: 'barrel_small_a', tileX: 73, tileY: 65, blocker: { width: 12, height: 8, offsetY: -1 }, collision: [73, 65, 167] },
    { id: 'anvil_small_a', tileX: 73, tileY: 64, blocker: { width: 18, height: 8, offsetY: -1 }, collision: [73, 64, 167] },
    { id: 'weapon_rack_sword_a', tileX: 75, tileY: 64, blocker: { width: 18, height: 10, offsetY: -1 }, collision: [75, 64, 167] },
    { id: 'forge_clutter_station_a', tileX: 76, tileY: 64, blocker: { width: 26, height: 14, offsetY: -2 }, collision: [76, 64, 167] },
  ];

  for (const placement of placements) {
    if (placement.collision) {
      stampCollision(layers, context.width, placement.collision[0], placement.collision[1], placement.collision[2]);
    }
  }

  return placements.map(({ collision, ...placement }) => placement);
}

module.exports = {
  placeProps,
};
