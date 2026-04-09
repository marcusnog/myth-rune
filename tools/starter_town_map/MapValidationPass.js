'use strict';

const { assertLayerIsSafe, assertRuntimePlacementIsSafe } = require('./TileCategoryGuard');

function validateGeneratedMap(layers, runtimePlacements) {
  assertLayerIsSafe('ground', layers.ground, { requireFilled: true });
  assertLayerIsSafe('ground_variation', layers.ground_variation);
  assertLayerIsSafe('paths', layers.paths);
  assertLayerIsSafe('water', layers.water);
  assertLayerIsSafe('transitions', layers.transitions);
  assertLayerIsSafe('structures', layers.structures);
  assertLayerIsSafe('props', layers.props);
  assertLayerIsSafe('collision', layers.collision);
  assertLayerIsSafe('above_player', layers.above_player);

  for (const placement of runtimePlacements) {
    assertRuntimePlacementIsSafe(placement);
  }
}

module.exports = {
  validateGeneratedMap,
};
