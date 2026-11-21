import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_CATALOG,
  RARITY_STYLES,
  WOOD_WALL_SVG,
  getCatalogBallsByRarity,
} from '../assets/ballImages.js';
import {
  applyHealToUnit,
  computeBandageAllyHeal,
  computeBandageSelfHeal,
  getRarityUpgradeChance,
  resolveEnemyTargetRarity,
  resolveParryOnDefender,
  roundStat,
} from '../lib/ballCombatHelpers.js';

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

test('rare rarity style is light blue and laser_ball, sword_ball, bandage_ball are registered', () => {
  assert.equal(RARITY_STYLES.rare.label, 'レア');
  assert.equal(RARITY_STYLES.rare.cardBg, '#38BDF8');

  const laser = BALL_CATALOG.laser_ball;
  assert.equal(laser.name, 'レーザーボール');
  assert.equal(laser.rarity, 'rare');
  assert.equal(laser.hp, 15);
  assert.equal(laser.atk, 1.5);
  assert.deepEqual(laser.attributes, ['貫通']);
  assert.equal(laser.piercing, true);
  assert.equal(laser.isPhysical, false);

  const sword = BALL_CATALOG.sword_ball;
  assert.equal(sword.name, 'ソードボール');
  assert.equal(sword.rarity, 'rare');
  assert.equal(sword.hp, 12);
  assert.equal(sword.atk, 1.7);

  const bandage = BALL_CATALOG.bandage_ball;
  assert.equal(bandage.name, '絆創膏ボール');
  assert.equal(bandage.rarity, 'rare');
  assert.equal(bandage.hp, 16);
  assert.equal(bandage.atk, 0.9);

  const rares = getCatalogBallsByRarity('rare').map((b) => b.id);
  assert.deepEqual(rares.sort(), ['bandage_ball', 'laser_ball', 'sword_ball']);
});

test('rare enemy spawn probability is 2.5% when owning 6+ uncommon balls', () => {
  assert.equal(getRarityUpgradeChance('common'), 0.1);
  assert.equal(getRarityUpgradeChance('uncommon'), 0.025);

  assert.equal(resolveEnemyTargetRarity('uncommon', 5, true, 0.01).upgraded, false);
  assert.equal(resolveEnemyTargetRarity('uncommon', 6, true, 0.0249).upgraded, true);
  assert.equal(resolveEnemyTargetRarity('uncommon', 6, true, 0.025).upgraded, false);
});

test('sword_ball parries every 4th physical attack and reflects half damage, but piercing/non-physical bypasses', () => {
  const sword = { ballId: 'sword_ball', dead: false, parryCounter: 0 };

  assert.equal(resolveParryOnDefender(sword, 2, { isPhysical: true, isPiercing: false }).parried, false);
  assert.equal(resolveParryOnDefender(sword, 2, { isPhysical: true, isPiercing: false }).parried, false);
  assert.equal(resolveParryOnDefender(sword, 2, { isPhysical: true, isPiercing: false }).parried, false);

  // 4th hit: physical -> parried with 50% reflection
  const fourth = resolveParryOnDefender(sword, 2.5, { isPhysical: true, isPiercing: false });
  assert.equal(fourth.parried, true);
  assert.equal(fourth.reflectedDamage, 1.25);

  // Advance another 3 hits to prepare next 4th hit
  resolveParryOnDefender(sword, 1, { isPhysical: true, isPiercing: false });
  resolveParryOnDefender(sword, 1, { isPhysical: true, isPiercing: false });
  resolveParryOnDefender(sword, 1, { isPhysical: true, isPiercing: false });

  // 8th hit is Laser (piercing + non-physical) -> bypasses parry!
  const eighth = resolveParryOnDefender(sword, 3.75, { isPhysical: false, isPiercing: true });
  assert.equal(eighth.parried, false);
  assert.equal(eighth.bypassedByPierce, true);
  assert.equal(eighth.reflectedDamage, 0);
});

test('bandage_ball self heal (18%, cap 8) and bench ally heal (15%) round to 2 decimal places', () => {
  assert.equal(roundStat(2.885), 2.89);
  assert.equal(roundStat(2.884), 2.88);
  assert.equal(computeBandageSelfHeal(16), 2.88);
  assert.equal(computeBandageSelfHeal(100), 8); // Capped at 8

  assert.equal(computeBandageAllyHeal(9), 1.35);
  assert.equal(computeBandageAllyHeal(15), 2.25);
  assert.equal(computeBandageAllyHeal(10), 1.5);

  const ally = { maxHp: 9, hp: 5, dead: false };
  const healed = applyHealToUnit(ally, computeBandageAllyHeal(ally.maxHp));
  assert.equal(healed, 1.35);
  assert.equal(ally.hp, 6.35);
});
