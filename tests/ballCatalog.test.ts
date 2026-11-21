import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_CATALOG,
  WOOD_WALL_SVG,
  getCatalogBallsByRarity,
} from '../assets/ballImages.js';

test('wood_ball is registered as uncommon with HP 9, ATK 1.1, and wall summon ability', () => {
  const wood = BALL_CATALOG.wood_ball;
  assert.ok(wood);
  assert.equal(wood.name, '木材ボール');
  assert.equal(wood.rarity, 'uncommon');
  assert.equal(wood.hp, 9);
  assert.equal(wood.atk, 1.1);
  assert.ok(wood.ability.includes('壁'));
  assert.ok(WOOD_WALL_SVG.includes('<svg'));

  const uncommons = getCatalogBallsByRarity('uncommon').map((b) => b.id);
  assert.ok(uncommons.includes('wood_ball'));
});
