'use strict';

const path = require('path');

const REGISTRY_PATH = path.resolve(
  __dirname,
  '../../web-client/public/maps/starter_town/tile-registry.json',
);

const registry = require(REGISTRY_PATH);

function getPathValues(object, dottedPath) {
  return dottedPath.split('.').reduce((value, key) => value?.[key], object) ?? [];
}

function buildLayerWhitelist(layerName) {
  const whitelist = new Set();
  for (const dottedPath of registry.layerRules[layerName] ?? []) {
    for (const gid of getPathValues(registry, dottedPath)) {
      whitelist.add(gid);
    }
  }
  return whitelist;
}

function buildForbiddenSet() {
  const forbidden = new Set();
  for (const gids of Object.values(registry.forbidden)) {
    for (const gid of gids) {
      forbidden.add(gid);
    }
  }
  return forbidden;
}

function buildRuntimeFrameSet() {
  const runtimeFrames = new Set([
    ...registry.structures.runtimeFrames,
    ...registry.blocked.runtimeFrames,
  ]);
  for (const ids of Object.values(registry.props.runtimeFrames)) {
    for (const id of ids) {
      runtimeFrames.add(id);
    }
  }
  return runtimeFrames;
}

module.exports = {
  registry,
  buildForbiddenSet,
  buildLayerWhitelist,
  buildRuntimeFrameSet,
};
