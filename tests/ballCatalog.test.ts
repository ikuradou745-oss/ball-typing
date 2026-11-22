import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_CATALOG,
  FLOWER_UNIT_SVG,
  RARITY_STYLES,
  SEED_UNIT_SVG,
  SPROUT_UNIT_SVG,
  WOOD_WALL_SVG,
  getCatalogBallsByRarity,
} from '../assets/ballImages.js';
import {
  advanceTreeBallGrowth,
  applyHealToUnit,
  clearTreeGrowthOnDefeat,
  computeBandageAllyHeal,
  computeBandageSelfHeal,
  computeSpearDeathStrike,
  doesFrontAbilitySkipAttack,
  getRarityUpgradeChance,
  resolveEnemyTargetRarity,
  resolveParryOnDefender,
  roundStat,
} from '../lib/ballCombatHelpers.js';

test('bandage_ball does NOT skip front attack on turn 4 heal turn (while stone/laser charge on turn 3)', () => {
  assert.equal(doesFrontAbilitySkipAttack('bandage_ball', 4), false);
  assert.equal(doesFrontAbilitySkipAttack('bandage_ball', 6), false);
  assert.equal(doesFrontAbilitySkipAttack('stone_ball', 3), true);
  assert.equal(doesFrontAbilitySkipAttack('laser_ball', 3), true);
  assert.equal(doesFrontAbilitySkipAttack('laser_ball', 4), false);
});

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

  const tree = BALL_CATALOG.tree_ball;
  assert.equal(tree.name, 'ツリーボール');
  assert.equal(tree.rarity, 'rare');
  assert.equal(tree.hp, 14);
  assert.equal(tree.atk, 0.9);
  assert.ok(SEED_UNIT_SVG.includes('<svg'));
  assert.ok(SPROUT_UNIT_SVG.includes('<svg'));
  assert.ok(FLOWER_UNIT_SVG.includes('<svg'));

  const spear = BALL_CATALOG.spear_ball;
  assert.equal(spear.name, '槍ボール');
  assert.equal(spear.rarity, 'rare');
  assert.equal(spear.hp, 15);
  assert.equal(spear.atk, 1.2);
  assert.ok(spear.svg.includes('<svg'));

  const rares = getCatalogBallsByRarity('rare').map((b) => b.id);
  assert.deepEqual(rares.sort(), [
    'bandage_ball',
    'laser_ball',
    'spear_ball',
    'sword_ball',
    'tree_ball',
  ]);
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

test('tree_ball plants seed on turn 1, grows cotyledon on turn 2, blooms into flower on turn 3, and clears if defeated early', () => {
  const tree = {
    ballId: 'tree_ball',
    dead: false,
    turnCounter: 0,
    growthStage: 'none',
    flowerSpawned: false,
  };

  tree.turnCounter = 1;
  const t1 = advanceTreeBallGrowth(tree);
  assert.equal(t1.stage, 'seed');
  assert.equal(t1.shouldSpawnFlower, false);
  assert.equal(tree.growthStage, 'seed');

  tree.turnCounter = 2;
  const t2 = advanceTreeBallGrowth(tree);
  assert.equal(t2.stage, 'sprout');
  assert.equal(t2.shouldSpawnFlower, false);
  assert.equal(tree.growthStage, 'sprout');

  tree.turnCounter = 3;
  const t3 = advanceTreeBallGrowth(tree);
  assert.equal(t3.stage, 'bloomed');
  assert.equal(t3.shouldSpawnFlower, true);
  assert.equal(tree.flowerSpawned, true);

  // Turn 4 should not spawn another flower
  tree.turnCounter = 4;
  const t4 = advanceTreeBallGrowth(tree);
  assert.equal(t4.changed, false);
  assert.equal(t4.shouldSpawnFlower, false);

  // Dying before blooming clears the planted seed/sprout
  const earlyDyingTree = {
    ballId: 'tree_ball',
    dead: true,
    turnCounter: 2,
    growthStage: 'sprout',
    flowerSpawned: false,
  };
  assert.equal(clearTreeGrowthOnDefeat(earlyDyingTree), true);
  assert.equal(earlyDyingTree.growthStage, 'none');

  // Dying after already blooming keeps bloomed state (flower stays)
  tree.dead = true;
  assert.equal(clearTreeGrowthOnDefeat(tree), false);
  assert.equal(tree.growthStage, 'bloomed');
});

test('spear_ball on-death pierces opposing front and second unit for ATK * 1.5 once', () => {
  const spear = { ballId: 'spear_ball', atk: 1.2, dead: true, spearTriggered: false };
  const enemies = [
    { uid: 'e_dead', hp: 0, dead: true, isHardened: false },
    { uid: 'e_0', hp: 10, dead: false, isHardened: false },
    { uid: 'e_1', hp: 10, dead: false, isHardened: true },
    { uid: 'e_2', hp: 10, dead: false, isHardened: false },
  ];

  const strikes = computeSpearDeathStrike(spear, enemies);
  assert.equal(strikes.length, 2);
  assert.equal(strikes[0].target.uid, 'e_0');
  assert.equal(strikes[0].position, 'front');
  assert.equal(strikes[0].damage, 1.8);
  assert.equal(strikes[1].target.uid, 'e_1');
  assert.equal(strikes[1].position, 'second');
  assert.equal(strikes[1].damage, 0.9); // Halved due to Stone Ball hardened state
  assert.equal(strikes[1].wasHalved, true);
  assert.equal(spear.spearTriggered, true);

  // Triggering a second time on the same spear_ball returns empty
  assert.deepEqual(computeSpearDeathStrike(spear, enemies), []);

  // Single remaining enemy works cleanly
  const spear2 = { ballId: 'spear_ball', atk: 1.2, dead: true, spearTriggered: false };
  const singleEnemy = [{ uid: 'e_only', hp: 5, dead: false, isHardened: false }];
  const singleStrikes = computeSpearDeathStrike(spear2, singleEnemy);
  assert.equal(singleStrikes.length, 1);
  assert.equal(singleStrikes[0].target.uid, 'e_only');
  assert.equal(singleStrikes[0].damage, 1.8);
});


