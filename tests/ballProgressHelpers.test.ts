import test from 'node:test';
import assert from 'node:assert/strict';
import { BALL_CATALOG, FLOWER_UNIT_SVG, WOOD_WALL_SVG } from '../assets/ballImages.js';
import {
  advancePityOnBattleWin,
  deserializeBattleState,
  getGuaranteedPityRarity,
  getNextBallGuideSummary,
  getRequiredWinsForRarity,
  serializeBattleState,
} from '../lib/ballProgressHelpers.js';

test('getRequiredWinsForRarity starts from rare (10) and scales 5x per rarity', () => {
  assert.equal(getRequiredWinsForRarity('common'), null);
  assert.equal(getRequiredWinsForRarity('uncommon'), null);
  assert.equal(getRequiredWinsForRarity('rare'), 10);
  assert.equal(getRequiredWinsForRarity('super_rare'), 50);
  assert.equal(getRequiredWinsForRarity('legend'), 250);
});

test('getNextBallGuideSummary shows probability only for common->uncommon and unlocks win countdown from rare', () => {
  const commonStarter = getNextBallGuideSummary(
    ['sponge_ball'],
    { sponge_ball: 3 },
    {},
    BALL_CATALOG
  );
  assert.equal(commonStarter.nextRarity, 'uncommon');
  assert.equal(commonStarter.isChanceUnlocked, false);
  assert.equal(commonStarter.activeChancePercent, 0);
  assert.equal(commonStarter.baseChancePercent, 10);
  assert.equal(commonStarter.requiredWins, null);
  assert.equal(commonStarter.remainingWins, null);

  const commonUnlocked = getNextBallGuideSummary(
    ['sponge_ball', 'rubber_ball'],
    { sponge_ball: 4, rubber_ball: 2 },
    {},
    BALL_CATALOG
  );
  assert.equal(commonUnlocked.nextRarity, 'uncommon');
  assert.equal(commonUnlocked.isChanceUnlocked, true);
  assert.equal(commonUnlocked.activeChancePercent, 10);

  const aimingRare = getNextBallGuideSummary(
    ['sponge_ball', 'wood_ball'],
    { sponge_ball: 6, wood_ball: 6 },
    { rare: 4 },
    BALL_CATALOG
  );
  assert.equal(aimingRare.nextRarity, 'rare');
  assert.equal(aimingRare.isChanceUnlocked, true);
  assert.equal(aimingRare.activeChancePercent, 2.5);
  assert.equal(aimingRare.requiredWins, 10);
  assert.equal(aimingRare.currentWins, 4);
  assert.equal(aimingRare.remainingWins, 6);

  const aimingSuperRare = getNextBallGuideSummary(
    ['laser_ball'],
    { laser_ball: 6 },
    { rare: 2, super_rare: 12 },
    BALL_CATALOG
  );
  assert.equal(aimingSuperRare.nextRarity, 'super_rare');
  assert.equal(aimingSuperRare.isChanceUnlocked, true);
  assert.equal(aimingSuperRare.activeChancePercent, 1.25);
  assert.equal(aimingSuperRare.requiredWins, 50);
  assert.equal(aimingSuperRare.remainingWins, 38);

  const aimingLegend = getNextBallGuideSummary(
    ['magician_ball'],
    { magician_ball: 1 },
    { super_rare: 5, legend: 40 },
    BALL_CATALOG
  );
  assert.equal(aimingLegend.nextRarity, 'legend');
  assert.equal(aimingLegend.requiredWins, 250);
  assert.equal(aimingLegend.remainingWins, 210);
});

test('advancePityOnBattleWin requires 6+ balls of same rarity, increments up to 10, and resets when rare appears', () => {
  const notSixUncommon = {
    ownedBalls: ['sponge_ball', 'wood_ball'],
    ballCounts: { sponge_ball: 6, wood_ball: 3 },
    pityWins: { rare: 0 },
  };
  assert.equal(
    advancePityOnBattleWin(notSixUncommon, [{ rarity: 'uncommon', isWall: false }], BALL_CATALOG).rare,
    0
  );

  let profile = {
    ownedBalls: ['sponge_ball', 'wood_ball'],
    ballCounts: { sponge_ball: 6, wood_ball: 6 },
    pityWins: { rare: 9 },
  };
  assert.equal(getGuaranteedPityRarity(profile, BALL_CATALOG), null);

  profile.pityWins = advancePityOnBattleWin(
    profile,
    [{ rarity: 'uncommon', isWall: false }],
    BALL_CATALOG
  );
  assert.equal(profile.pityWins.rare, 10);
  assert.equal(getGuaranteedPityRarity(profile, BALL_CATALOG), 'rare');

  // When a rare enemy appears and the player wins, pity resets to 0
  profile.pityWins = advancePityOnBattleWin(
    profile,
    [{ rarity: 'rare', isWall: false }],
    BALL_CATALOG
  );
  assert.equal(profile.pityWins.rare, 0);
  assert.equal(getGuaranteedPityRarity(profile, BALL_CATALOG), null);
});

test('serializeBattleState and deserializeBattleState round-trip mid-battle units, walls, word, and shield', () => {
  const sampleBattle = {
    playerTeam: [
      {
        uid: 'p_0',
        ballId: 'wood_ball',
        name: '木材ボール',
        rarity: 'uncommon',
        level: 1,
        maxHp: 9,
        hp: 0,
        atk: 1.1,
        svg: '<svg>heavy</svg>',
        summonedWall: true,
        isWall: false,
        dead: true,
      },
      {
        uid: 'p_0_wall',
        ballId: 'wood_wall',
        name: '木の壁',
        rarity: 'uncommon',
        level: 1,
        maxHp: 4.5,
        hp: 3.4,
        atk: 0,
        svg: '<svg>wall</svg>',
        isWall: true,
        dead: false,
      },
      {
        uid: 'p_1',
        ballId: 'laser_ball',
        name: 'ブルーレーザーボール',
        rarity: 'rare',
        level: 1,
        maxHp: 15,
        hp: 15,
        atk: 1.5,
        piercing: true,
        isPhysical: false,
        laserCharged: true,
        svg: '<svg>laser</svg>',
        isWall: false,
        dead: false,
      },
      {
        uid: 'p_2',
        ballId: 'one_shot_ball',
        name: '一発ボール',
        rarity: 'super_rare',
        level: 1,
        maxHp: 21,
        hp: 19.5,
        atk: 2.2,
        oneShotPerfectCount: 1,
        svg: '<svg>oneshot</svg>',
        isWall: false,
        dead: false,
      },
    ],
    enemyTeam: [
      {
        uid: 'e_0',
        ballId: 'sword_ball',
        name: 'ソードボール',
        rarity: 'rare',
        level: 1,
        maxHp: 12,
        hp: 8.5,
        atk: 1.7,
        parryCounter: 3,
        burnTurns: 2,
        iceTurns: 3,
        stunTurns: 1,
        svg: '<svg>sword</svg>',
        isWall: false,
        dead: false,
      },
      {
        uid: 'e_0',
        ballId: 'tree_ball',
        name: 'ツリーボール',
        rarity: 'rare',
        level: 1,
        maxHp: 14,
        hp: 11,
        atk: 0.9,
        growthStage: 'bloomed',
        flowerSpawned: true,
        svg: '<svg>tree</svg>',
        isWall: false,
        dead: false,
      },
      {
        uid: 'e_0_flower',
        ballId: 'flower',
        name: '花',
        rarity: 'rare',
        level: 1,
        maxHp: 10,
        hp: 10,
        atk: 1,
        isWall: false,
        isFlower: true,
        svg: '<svg>flower</svg>',
        dead: false,
      },
      {
        uid: 'e_2',
        ballId: 'spear_ball',
        name: '槍ボール',
        rarity: 'rare',
        level: 1,
        maxHp: 15,
        hp: 0,
        atk: 1.2,
        spearTriggered: true,
        isWall: false,
        svg: '<svg>spear</svg>',
        dead: true,
      },
    ],
    currentWord: { kana: 'たいぴんぐ', romaji: 'taipingu' },
    typedIndex: 3,
    perfectStreak: 2,
    comboShield: 4,
    wordHadMistake: true,
    wordsCompleted: 2,
    perfectWordsCount: 1,
    maxMultiplierReached: 1.2,
    turn: 'enemy',
    isResolvingTurn: true,
  };

  const snapshot = serializeBattleState(sampleBattle, 1);
  assert.ok(snapshot);
  // SVGs should not be stored in snapshot JSON
  assert.equal('svg' in snapshot.playerTeam[1], false);

  const restored = deserializeBattleState(
    snapshot,
    BALL_CATALOG,
    WOOD_WALL_SVG,
    'sponge_ball',
    () => ({
      kana: 'ふぉーるばっく',
      romaji: 'fo-rubakku',
    }),
    FLOWER_UNIT_SVG
  );
  assert.ok(restored);
  assert.equal(restored.battleSpeedIndex, 1);
  assert.equal(restored.battleState.turn, 'player');
  assert.equal(restored.battleState.isResolvingTurn, false);
  assert.equal(restored.battleState.typedIndex, 3);
  assert.equal(restored.battleState.currentWord.romaji, 'taipingu');
  assert.equal(restored.battleState.comboShield, 4);
  assert.equal(restored.battleState.perfectStreak, 2);
  assert.equal(restored.battleState.playerTeam[1].isWall, true);
  assert.equal(restored.battleState.playerTeam[1].svg, WOOD_WALL_SVG);
  assert.equal(restored.battleState.playerTeam[2].laserCharged, true);
  assert.equal(restored.battleState.playerTeam[2].name, 'ブルーレーザーボール');
  assert.equal(restored.battleState.playerTeam[3].atk, 2.2);
  assert.equal(restored.battleState.playerTeam[3].oneShotPerfectCount, 1);
  assert.equal(restored.battleState.enemyTeam[0].parryCounter, 3);
  assert.equal(restored.battleState.enemyTeam[0].burnTurns, 2);
  assert.equal(restored.battleState.enemyTeam[0].iceTurns, 3);
  assert.equal(restored.battleState.enemyTeam[0].stunTurns, 1);
  assert.equal(restored.battleState.enemyTeam[0].svg, BALL_CATALOG.sword_ball.svg);
  assert.equal(restored.battleState.enemyTeam[1].growthStage, 'bloomed');
  assert.equal(restored.battleState.enemyTeam[1].flowerSpawned, true);
  assert.equal(restored.battleState.enemyTeam[2].isFlower, true);
  assert.equal(restored.battleState.enemyTeam[2].name, '花');
  assert.equal(restored.battleState.enemyTeam[2].maxHp, 10);
  assert.equal(restored.battleState.enemyTeam[2].atk, 1);
  assert.equal(restored.battleState.enemyTeam[2].svg, FLOWER_UNIT_SVG);
  assert.equal(restored.battleState.enemyTeam[3].ballId, 'spear_ball');
  assert.equal(restored.battleState.enemyTeam[3].spearTriggered, true);
});

test('serializeBattleState / deserializeBattleState reject finished or defeated battles', () => {
  assert.equal(
    serializeBattleState({
      turn: 'finished',
      playerTeam: [{ uid: 'p_0', ballId: 'sponge_ball', hp: 5, maxHp: 10, dead: false }],
      enemyTeam: [{ uid: 'e_0', ballId: 'sponge_ball', hp: 0, maxHp: 10, dead: true }],
    }),
    null
  );

  const finishedSnapshot = {
    playerTeam: [{ uid: 'p_0', ballId: 'sponge_ball', hp: 0, maxHp: 10, dead: true }],
    enemyTeam: [{ uid: 'e_0', ballId: 'sponge_ball', hp: 5, maxHp: 10, dead: false }],
    currentWord: { kana: 'あいう', romaji: 'aiu' },
  };
  assert.equal(
    deserializeBattleState(finishedSnapshot, BALL_CATALOG, WOOD_WALL_SVG, 'sponge_ball'),
    null
  );
});
