import test from 'node:test';
import assert from 'node:assert/strict';
import { BALL_CATALOG, WOOD_WALL_SVG } from '../assets/ballImages.js';
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
  assert.equal(getRequiredWinsForRarity('legend'), 50);
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

  const aimingLegend = getNextBallGuideSummary(
    ['laser_ball'],
    { laser_ball: 1 },
    { rare: 2, legend: 12 },
    BALL_CATALOG
  );
  assert.equal(aimingLegend.nextRarity, 'legend');
  assert.equal(aimingLegend.requiredWins, 50);
  assert.equal(aimingLegend.remainingWins, 38);
});

test('advancePityOnBattleWin increments rare pity up to 10, triggers guarantee, and resets when rare appears', () => {
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
        name: 'レーザーボール',
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
        svg: '<svg>sword</svg>',
        isWall: false,
        dead: false,
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

  const restored = deserializeBattleState(snapshot, BALL_CATALOG, WOOD_WALL_SVG, 'sponge_ball', () => ({
    kana: 'ふぉーるばっく',
    romaji: 'fo-rubakku',
  }));
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
  assert.equal(restored.battleState.enemyTeam[0].parryCounter, 3);
  assert.equal(restored.battleState.enemyTeam[0].svg, BALL_CATALOG.sword_ball.svg);
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
