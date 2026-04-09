'use strict';

const { buildForbiddenSet, buildLayerWhitelist, buildRuntimeFrameSet } = require('./TileRegistry');

const forbidden = buildForbiddenSet();
const runtimeFrames = buildRuntimeFrameSet();

function assertLayerIsSafe(layerName, data, { requireFilled = false } = {}) {
  const whitelist = buildLayerWhitelist(layerName);
  for (let index = 0; index < data.length; index += 1) {
    const gid = data[index];
    if (requireFilled && gid === 0) {
      throw new Error(`${layerName} contains empty tile at index ${index}`);
    }
    if (gid === 0) {
      continue;
    }
    if (forbidden.has(gid)) {
      throw new Error(`${layerName} contains forbidden gid ${gid} at index ${index}`);
    }
    if (!whitelist.has(gid)) {
      throw new Error(`${layerName} contains non-whitelisted gid ${gid} at index ${index}`);
    }
  }
}

function assertRuntimePlacementIsSafe(placement) {
  if (!runtimeFrames.has(placement.id)) {
    throw new Error(`Runtime placement '${placement.id}' is not whitelisted.`);
  }
}

module.exports = {
  assertLayerIsSafe,
  assertRuntimePlacementIsSafe,
};
