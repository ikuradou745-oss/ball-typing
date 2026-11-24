import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_CATALOG,
  FLOWER_UNIT_SVG,
  RARITY_ORDER,
  RARITY_STYLES,
  SEED_UNIT_SVG,
  SPROUT_UNIT_SVG,
  WOOD_WALL_SVG,
  getCatalogBallsByRarity,
} from '../assets/ballImages.js';
import {
  MAGICIAN_SPELLS,
  advanceTreeBallGrowth,
  applyHealToUnit,
  applyOneShotMistake,
  applyOneShotPerfect,
  clearTreeGrowthOnDefeat,
  computeBandageAllyHeal,
  computeBandageSelfHeal,
  computeSpearDeathStrike,
  doesFrontAbilitySkipAttack,
  getRarityUpgradeChance,
  processStartOfTurnStatuses,
  resolveEnemyTargetRarity,
  resolveParryOnDefender,
  roundStat,
  shouldTriggerMagicianSpell,
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
  assert.equal(laser.name, 'ブルーレーザーボール');
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

test('super_rare rarity follows rare in yellow-green and registers red_laser_ball, one_shot_ball, magician_ball', () => {
  assert.deepEqual(RARITY_ORDER, ['common', 'uncommon', 'rare', 'super_rare', 'legend']);
  assert.equal(RARITY_STYLES.super_rare.label, 'スーパーレア');
  assert.equal(RARITY_STYLES.super_rare.cardBg, '#A3E635');
  assert.equal(RARITY_STYLES.super_rare.tier, 3);
  assert.equal(RARITY_STYLES.legend.tier, 4);

  const redLaser = BALL_CATALOG.red_laser_ball;
  assert.equal(redLaser.name, 'レッドレーザーボール');
  assert.equal(redLaser.rarity, 'super_rare');
  assert.equal(redLaser.hp, 18);
  assert.equal(redLaser.atk, 5);
  assert.equal(redLaser.piercing, true);
  assert.equal(redLaser.isPhysical, false);

  const oneShot = BALL_CATALOG.one_shot_ball;
  assert.equal(oneShot.name, '一発ボール');
  assert.equal(oneShot.rarity, 'super_rare');
  assert.equal(oneShot.hp, 21);
  assert.equal(oneShot.atk, 2);

  const magician = BALL_CATALOG.magician_ball;
  assert.equal(magician.name, 'マジシャンボール');
  assert.equal(magician.rarity, 'super_rare');
  assert.equal(magician.hp, 24);
  assert.equal(magician.atk, 1.9);

  const superRares = getCatalogBallsByRarity('super_rare').map((b) => b.id).sort();
  assert.deepEqual(superRares, ['magician_ball', 'one_shot_ball', 'red_laser_ball']);

  // Rare -> Super Rare upgrade probability is 1.25% when owning 6+ rare balls
  assert.equal(getRarityUpgradeChance('rare'), 0.0125);
  assert.equal(resolveEnemyTargetRarity('rare', 5, true, 0.005).upgraded, false);
  assert.equal(resolveEnemyTargetRarity('rare', 6, true, 0.0124).upgraded, true);
  assert.equal(resolveEnemyTargetRarity('rare', 6, true, 0.0125).upgraded, false);
});

test('red_laser_ball can only attack once every 3 turns', () => {
  assert.equal(doesFrontAbilitySkipAttack('red_laser_ball', 1), true);
  assert.equal(doesFrontAbilitySkipAttack('red_laser_ball', 2), true);
  assert.equal(doesFrontAbilitySkipAttack('red_laser_ball', 3), false);
  assert.equal(doesFrontAbilitySkipAttack('red_laser_ball', 4), true);
  assert.equal(doesFrontAbilitySkipAttack('red_laser_ball', 6), false);
});

test('one_shot_ball loses 1 HP per typing mistake, resets x1.1 ATK boost on mistake, and does not stack x1.1 ATK', () => {
  const unit = {
    ballId: 'one_shot_ball',
    maxHp: 21,
    hp: 21,
    baseAtk: 2,
    atk: 2,
    oneShotPerfectCount: 0,
    dead: false,
  };

  // Mistake deducts 1 HP (no boost active yet)
  const m1 = applyOneShotMistake(unit);
  assert.equal(m1.triggered, true);
  assert.equal(m1.damage, 1);
  assert.equal(m1.died, false);
  assert.equal(m1.lostAtkBoost, false);
  assert.equal(unit.hp, 20);
  assert.equal(unit.atk, 2);

  // First perfect word heals +0.5 HP and applies x1.1 ATK (2 -> 2.2)
  const p1 = applyOneShotPerfect(unit);
  assert.equal(p1.triggered, true);
  assert.equal(p1.healed, 0.5);
  assert.equal(p1.atkBoostApplied, true);
  assert.equal(unit.hp, 20.5);
  assert.equal(unit.atk, 2.2);
  assert.equal(unit.oneShotPerfectCount, 1);

  // Second perfect word still heals +0.5 HP (capped at 21) but does NOT stack x1.1 ATK
  const p2 = applyOneShotPerfect(unit);
  assert.equal(p2.healed, 0.5);
  assert.equal(p2.atkBoostApplied, false);
  assert.equal(unit.hp, 21);
  assert.equal(unit.atk, 2.2);
  assert.equal(unit.oneShotPerfectCount, 1);

  // Mistake removes the x1.1 ATK boost back to base ATK (2.2 -> 2)
  const m2 = applyOneShotMistake(unit);
  assert.equal(m2.triggered, true);
  assert.equal(m2.damage, 1);
  assert.equal(m2.lostAtkBoost, true);
  assert.equal(unit.hp, 20);
  assert.equal(unit.atk, 2);
  assert.equal(unit.oneShotPerfectCount, 0);

  // Re-earning perfect restores x1.1 ATK again
  const p3 = applyOneShotPerfect(unit);
  assert.equal(p3.atkBoostApplied, true);
  assert.equal(unit.atk, 2.2);
  assert.equal(unit.oneShotPerfectCount, 1);

  // Lethal mistake at 1 HP kills the unit and clears boost
  unit.hp = 1;
  const lethal = applyOneShotMistake(unit);
  assert.equal(lethal.died, true);
  assert.equal(lethal.lostAtkBoost, true);
  assert.equal(unit.hp, 0);
  assert.equal(unit.atk, 2);
  assert.equal(unit.oneShotPerfectCount, 0);
  assert.equal(unit.dead, true);
});

test('magician_ball triggers spell every 5th attack and processes burn, ice, and stun statuses', () => {
  const mage = { ballId: 'magician_ball', dead: false, attacksMade: 0 };
  for (let i = 0; i < 4; i++) {
    assert.equal(shouldTriggerMagicianSpell(mage), false);
    mage.attacksMade += 1;
  }
  // 5th attack triggers spell choice
  assert.equal(shouldTriggerMagicianSpell(mage), true);

  assert.equal(MAGICIAN_SPELLS.fire.atkMultiplier, 1.5);
  assert.equal(MAGICIAN_SPELLS.fire.burnTurns, 2);
  assert.equal(MAGICIAN_SPELLS.ice.atkMultiplier, 1.0);
  assert.equal(MAGICIAN_SPELLS.ice.iceTurns, 3);
  assert.equal(MAGICIAN_SPELLS.thunder.atkMultiplier, 1.3);
  assert.equal(MAGICIAN_SPELLS.thunder.stunTurns, 1);

  // Burn deals 1 damage/turn for 2 turns
  const burned = { hp: 10, maxHp: 10, burnTurns: 2, iceTurns: 0, stunTurns: 0, dead: false };
  const b1 = processStartOfTurnStatuses(burned);
  assert.equal(b1.burnDamage, 1);
  assert.equal(burned.hp, 9);
  assert.equal(burned.burnTurns, 1);
  assert.equal(b1.incapacitated, false);

  // Ice deals 0.8 damage/turn and incapacitates when roll < 0.35
  const iced = { hp: 10, maxHp: 10, burnTurns: 0, iceTurns: 3, stunTurns: 0, dead: false };
  const i1 = processStartOfTurnStatuses(iced, 0.34);
  assert.equal(i1.iceDamage, 0.8);
  assert.equal(iced.hp, 9.2);
  assert.equal(iced.iceTurns, 2);
  assert.equal(i1.froze, true);
  assert.equal(i1.incapacitated, true);

  const i2 = processStartOfTurnStatuses(iced, 0.35);
  assert.equal(i2.iceDamage, 0.8);
  assert.equal(iced.hp, 8.4);
  assert.equal(i2.froze, false);
  assert.equal(i2.incapacitated, false);

  // Stun incapacitates for 1 turn
  const stunned = { hp: 10, maxHp: 10, burnTurns: 0, iceTurns: 0, stunTurns: 1, dead: false };
  const s1 = processStartOfTurnStatuses(stunned);
  assert.equal(s1.stunned, true);
  assert.equal(s1.incapacitated, true);
  assert.equal(stunned.stunTurns, 0);

  // Fatal burn marks unit dead cleanly
  const dying = { hp: 0.9, maxHp: 10, burnTurns: 1, iceTurns: 2, stunTurns: 0, dead: false };
  const d1 = processStartOfTurnStatuses(dying, 0.1);
  assert.equal(d1.died, true);
  assert.equal(dying.dead, true);
  assert.equal(dying.hp, 0);
});



