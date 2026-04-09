'use strict';

const resourceNodes = [
  { id: 'wood_1', type: 'oak_tree', tileX: 56, tileY: 38, qty: 3, gatherMs: 1500, respawnMs: 300000 },
  { id: 'wood_2', type: 'oak_tree', tileX: 61, tileY: 35, qty: 3, gatherMs: 1500, respawnMs: 300000 },
  { id: 'wood_3', type: 'oak_tree', tileX: 67, tileY: 34, qty: 4, gatherMs: 1500, respawnMs: 300000 },
  { id: 'wood_4', type: 'oak_tree', tileX: 71, tileY: 38, qty: 3, gatherMs: 1500, respawnMs: 300000 },
  { id: 'wood_5', type: 'pine_tree', tileX: 36, tileY: 48, qty: 3, gatherMs: 1800, respawnMs: 300000 },
  { id: 'wood_6', type: 'pine_tree', tileX: 28, tileY: 62, qty: 3, gatherMs: 1750, respawnMs: 300000 },
  { id: 'wood_7', type: 'oak_tree', tileX: 55, tileY: 90, qty: 3, gatherMs: 1500, respawnMs: 300000 },
  { id: 'wood_8', type: 'pine_tree', tileX: 80, tileY: 94, qty: 3, gatherMs: 1750, respawnMs: 300000 },
  { id: 'wood_9', type: 'oak_tree', tileX: 93, tileY: 58, qty: 3, gatherMs: 1500, respawnMs: 300000 },
  { id: 'wood_10', type: 'pine_tree', tileX: 23, tileY: 78, qty: 3, gatherMs: 1750, respawnMs: 300000 },
  { id: 'stone_1', type: 'stone_deposit', tileX: 85, tileY: 84, qty: 5, gatherMs: 2000, respawnMs: 300000 },
  { id: 'stone_2', type: 'stone_deposit', tileX: 89, tileY: 86, qty: 4, gatherMs: 2000, respawnMs: 300000 },
  { id: 'stone_3', type: 'stone_deposit', tileX: 83, tileY: 88, qty: 5, gatherMs: 2200, respawnMs: 300000 },
  { id: 'stone_4', type: 'stone_deposit', tileX: 92, tileY: 90, qty: 4, gatherMs: 2000, respawnMs: 300000 },
];

function stampCollision(layers, width, node) {
  if (node.type === 'stone_deposit') {
    layers.collision[node.tileY * width + node.tileX] = 167;
    return;
  }
  layers.collision[node.tileY * width + node.tileX] = 167;
  layers.collision[node.tileY * width + node.tileX + 1] = 167;
}

function createResourceNodeObjects(tileSize) {
  let objectId = 1;
  return resourceNodes.map((node) => ({
    id: objectId++,
    name: node.id,
    type: 'resource_node',
    x: node.tileX * tileSize,
    y: node.tileY * tileSize,
    width: tileSize,
    height: tileSize,
    visible: true,
    properties: [
      { name: 'nodeId', type: 'string', value: node.id },
      { name: 'nodeType', type: 'string', value: node.type },
      { name: 'tileX', type: 'int', value: node.tileX },
      { name: 'tileY', type: 'int', value: node.tileY },
      { name: 'quantity', type: 'int', value: node.qty },
      { name: 'gatherTimeMs', type: 'int', value: node.gatherMs },
      { name: 'respawnTimeMs', type: 'int', value: node.respawnMs },
    ],
  }));
}

function applyGameplayNodePreservationPass(layers, width) {
  for (const node of resourceNodes) {
    stampCollision(layers, width, node);
  }
  return resourceNodes;
}

module.exports = {
  applyGameplayNodePreservationPass,
  createResourceNodeObjects,
};
