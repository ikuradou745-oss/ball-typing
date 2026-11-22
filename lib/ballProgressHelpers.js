import {
  RARITY_ORDER,
  RARITY_STYLES,
  getCatalogBallsByRarity,
  getNextRarity,
} from '../assets/ballImages.js';
import { getRarityUpgradeChance } from './ballCombatHelpers.js';
import { TYPING_SHIELD_MAX, getPerfectMultiplier } from './typingComboHelpers.js';

export const RARE_GUARANTEED_BASE_WINS = 10;
export const RARITY_WIN_SCALE_FACTOR = 5;
export const ACTIVE_BATTLE_STORAGE_KEY = 'ball_typing_active_battle_v1';

/**
 * Guaranteed win requirement starts from 'rare' (tier 2):
 * rare -> 10 wins, legend -> 50 wins (x5 per tier), etc.
 * common / uncommon return null (no win countdown).
 */
export function getRequiredWinsForRarity(rarity) {
  const style = RARITY_STYLES[rarity];
  if (!style || typeof style.tier !== 'number') return null;
  if (style.tier < 2) return null;
  return RARE_GUARANTEED_BASE_WINS * Math.pow(RARITY_WIN_SCALE_FACTOR, style.tier - 2);
}

export function normalizePityWins(rawPityWins) {
  const result = {};
  for (const rarity of RARITY_ORDER) {
    if (getRequiredWinsForRarity(rarity) !== null) {
      const val = rawPityWins && typeof rawPityWins[rarity] === 'number' ? Math.floor(rawPityWins[rarity]) : 0;
      result[rarity] = Math.max(0, val);
    }
  }
  return result;
}

export function countOwnedBallsByRarity(ownedBalls, ballCounts, catalog) {
  const counts = {};
  for (const rarity of RARITY_ORDER) {
    counts[rarity] = 0;
  }
  if (!Array.isArray(ownedBalls) || !catalog) return counts;
  for (const id of ownedBalls) {
    const ball = catalog[id];
    if (!ball) continue;
    const n = ballCounts && typeof ballCounts[id] === 'number' ? Math.max(1, Math.floor(ballCounts[id])) : 1;
    counts[ball.rarity] = (counts[ball.rarity] || 0) + n;
  }
  return counts;
}

export function getHighestOwnedRarity(rarityCounts) {
  let highest = 'common';
  for (const rarity of RARITY_ORDER) {
    if ((rarityCounts[rarity] || 0) > 0) {
      highest = rarity;
    }
  }
  return highest;
}

export function getNextBallGuideSummary(ownedBalls, ballCounts, pityWins, catalog) {
  const rarityCounts = countOwnedBallsByRarity(ownedBalls, ballCounts, catalog);
  const highestOwnedRarity = getHighestOwnedRarity(rarityCounts);
  const nextRarity = getNextRarity(highestOwnedRarity);

  const prevRarity = highestOwnedRarity;
  const prevLabel = RARITY_STYLES[prevRarity]?.label || prevRarity;
  const nextLabel = nextRarity ? (RARITY_STYLES[nextRarity]?.label || nextRarity) : null;
  const prevOwnedCount = rarityCounts[prevRarity] || 0;
  const baseChance = getRarityUpgradeChance(prevRarity);
  const nextCatalogBalls = nextRarity ? getCatalogBallsByRarity(nextRarity) : [];
  const isRarityImplemented = nextCatalogBalls.length > 0;
  const isChanceUnlocked = Boolean(nextRarity && prevOwnedCount >= 6 && baseChance > 0);
  const activeChance = isChanceUnlocked ? baseChance : 0;

  const requiredWins = nextRarity ? getRequiredWinsForRarity(nextRarity) : null;
  const normalizedPity = normalizePityWins(pityWins);
  const currentWins = nextRarity && requiredWins !== null ? (normalizedPity[nextRarity] || 0) : 0;
  const remainingWins = requiredWins !== null ? Math.max(0, requiredWins - currentWins) : null;

  const tiers = RARITY_ORDER.slice(1).map((targetRarity, idx) => {
    const sourceRarity = RARITY_ORDER[idx];
    const sourceLabel = RARITY_STYLES[sourceRarity]?.label || sourceRarity;
    const targetLabel = RARITY_STYLES[targetRarity]?.label || targetRarity;
    const sourceCount = rarityCounts[sourceRarity] || 0;
    const chance = getRarityUpgradeChance(sourceRarity);
    const reqWins = getRequiredWinsForRarity(targetRarity);
    const wins = reqWins !== null ? (normalizedPity[targetRarity] || 0) : null;
    const remWins = reqWins !== null ? Math.max(0, reqWins - wins) : null;
    const implemented = getCatalogBallsByRarity(targetRarity).length > 0;
    return {
      sourceRarity,
      sourceLabel,
      targetRarity,
      targetLabel,
      sourceCount,
      unlockNeed: 6,
      unlocked: sourceCount >= 6,
      chancePercent: Math.round(chance * 10000) / 100,
      requiredWins: reqWins,
      currentWins: wins,
      remainingWins: remWins,
      implemented,
    };
  });

  return {
    rarityCounts,
    highestOwnedRarity,
    nextRarity,
    nextLabel,
    prevRarity,
    prevLabel,
    prevOwnedCount,
    activeChancePercent: Math.round(activeChance * 10000) / 100,
    baseChancePercent: Math.round(baseChance * 10000) / 100,
    isChanceUnlocked,
    isRarityImplemented,
    requiredWins,
    currentWins,
    remainingWins,
    tiers,
  };
}

export function advancePityOnBattleWin(profile, enemyTeam, catalog) {
  const pityWins = normalizePityWins(profile.pityWins);
  const rarityCounts = countOwnedBallsByRarity(profile.ownedBalls, profile.ballCounts, catalog);
  const highestOwned = getHighestOwnedRarity(rarityCounts);
  const nextRarity = getNextRarity(highestOwned);
  const requiredWins = nextRarity ? getRequiredWinsForRarity(nextRarity) : null;

  if (!nextRarity || requiredWins === null) {
    return pityWins;
  }

  // Both low-probability drops and guaranteed win countdown require 6+ balls of the current rarity
  if ((rarityCounts[highestOwned] || 0) < 6) {
    return pityWins;
  }

  // If the target rarity exists in the catalog and already appeared in this winning battle,
  // reset its pity counter back to 0 (player had an opportunity via probability or guarantee).
  const targetCatalog = getCatalogBallsByRarity(nextRarity);
  const sawTargetInEnemy =
    targetCatalog.length > 0 &&
    Array.isArray(enemyTeam) &&
    enemyTeam.some((u) => u && u.rarity === nextRarity && !u.isWall && !u.isFlower);

  if (sawTargetInEnemy) {
    return {
      ...pityWins,
      [nextRarity]: 0,
    };
  }

  const nextVal = Math.min(requiredWins, (pityWins[nextRarity] || 0) + 1);
  return {
    ...pityWins,
    [nextRarity]: nextVal,
  };
}

export function getGuaranteedPityRarity(profile, catalog) {
  const pityWins = normalizePityWins(profile.pityWins);
  const rarityCounts = countOwnedBallsByRarity(profile.ownedBalls, profile.ballCounts, catalog);
  const highestOwned = getHighestOwnedRarity(rarityCounts);
  if ((rarityCounts[highestOwned] || 0) < 6) return null;
  const nextRarity = getNextRarity(highestOwned);
  if (!nextRarity) return null;
  const requiredWins = getRequiredWinsForRarity(nextRarity);
  if (requiredWins === null) return null;
  if (getCatalogBallsByRarity(nextRarity).length === 0) return null;
  return (pityWins[nextRarity] || 0) >= requiredWins ? nextRarity : null;
}

function serializeUnit(unit) {
  return {
    uid: String(unit.uid || ''),
    ballId: String(unit.ballId || ''),
    name: String(unit.name || ''),
    rarity: String(unit.rarity || 'common'),
    level: Number(unit.level) || 1,
    maxHp: Number(unit.maxHp) || 1,
    hp: Number(unit.hp) || 0,
    atk: Number(unit.atk) || 0,
    attributes: Array.isArray(unit.attributes) ? [...unit.attributes] : [],
    piercing: Boolean(unit.piercing),
    isPhysical: unit.isPhysical !== false,
    revived: Boolean(unit.revived),
    exploded: Boolean(unit.exploded),
    summonedWall: Boolean(unit.summonedWall),
    spearTriggered: Boolean(unit.spearTriggered),
    isWall: Boolean(unit.isWall),
    isFlower: Boolean(unit.isFlower),
    growthStage: typeof unit.growthStage === 'string' ? unit.growthStage : 'none',
    flowerSpawned: Boolean(unit.flowerSpawned),
    attacksMade: Number(unit.attacksMade) || 0,
    turnCounter: Number(unit.turnCounter) || 0,
    benchTurnCounter: Number(unit.benchTurnCounter) || 0,
    parryCounter: Number(unit.parryCounter) || 0,
    laserCharged: Boolean(unit.laserCharged),
    isHardened: Boolean(unit.isHardened),
    atkDebuffTurns: Number(unit.atkDebuffTurns) || 0,
    atkMultiplier: Number(unit.atkMultiplier) || 1,
    missDebuffTurns: Number(unit.missDebuffTurns) || 0,
    dead: Boolean(unit.dead),
  };
}

export function serializeBattleState(battleState, battleSpeedIndex = 0) {
  if (!battleState || battleState.turn === 'finished') return null;
  if (!Array.isArray(battleState.playerTeam) || !Array.isArray(battleState.enemyTeam)) return null;

  const hasAlivePlayer = battleState.playerTeam.some((u) => u && !u.dead && !u.isWall);
  const hasAliveEnemy = battleState.enemyTeam.some((u) => u && !u.dead);
  if (!hasAlivePlayer || !hasAliveEnemy) return null;

  return {
    version: 1,
    savedAt: Date.now(),
    battleSpeedIndex: Number(battleSpeedIndex) === 1 ? 1 : 0,
    playerTeam: battleState.playerTeam.map(serializeUnit),
    enemyTeam: battleState.enemyTeam.map(serializeUnit),
    currentWord: battleState.currentWord
      ? {
          kana: String(battleState.currentWord.kana || ''),
          romaji: String(battleState.currentWord.romaji || ''),
        }
      : null,
    typedIndex: Math.max(0, Number(battleState.typedIndex) || 0),
    perfectStreak: Math.max(0, Number(battleState.perfectStreak) || 0),
    comboShield: Math.max(0, Math.min(TYPING_SHIELD_MAX, Number(battleState.comboShield) || 0)),
    wordHadMistake: Boolean(battleState.wordHadMistake),
    wordsCompleted: Math.max(0, Number(battleState.wordsCompleted) || 0),
    perfectWordsCount: Math.max(0, Number(battleState.perfectWordsCount) || 0),
    maxMultiplierReached: Number(battleState.maxMultiplierReached) || 1,
    turn: battleState.turn === 'enemy' ? 'enemy' : 'player',
  };
}

function deserializeUnit(raw, catalog, wallSvg, fallbackBallId, flowerSvg = '') {
  if (!raw || typeof raw !== 'object') return null;
  const isWall = Boolean(raw.isWall);
  const isFlower = !isWall && (Boolean(raw.isFlower) || raw.ballId === 'flower');
  const isSummonedToken = isWall || isFlower;
  const catalogBall = isSummonedToken ? null : (catalog[raw.ballId] || catalog[fallbackBallId]);
  if (!isSummonedToken && !catalogBall) return null;

  const hp = Math.max(0, Number(raw.hp) || 0);
  const maxHp = Math.max(1, Number(raw.maxHp) || (isFlower ? 10 : catalogBall ? catalogBall.hp : 1));
  return {
    uid: String(raw.uid || ''),
    ballId: isWall ? 'wood_wall' : isFlower ? 'flower' : catalogBall.id,
    name: isWall ? String(raw.name || '木の壁') : isFlower ? String(raw.name || '花') : catalogBall.name,
    rarity: isSummonedToken ? String(raw.rarity || (isFlower ? 'rare' : 'uncommon')) : catalogBall.rarity,
    level: isSummonedToken ? Number(raw.level) || 1 : catalogBall.level,
    maxHp,
    hp,
    atk: isWall ? 0 : isFlower ? 1 : catalogBall.atk,
    attributes: isSummonedToken ? [] : Array.isArray(catalogBall.attributes) ? [...catalogBall.attributes] : [],
    piercing: isSummonedToken ? false : Boolean(catalogBall.piercing),
    isPhysical: isWall ? false : isFlower ? true : catalogBall.isPhysical !== false,
    svg: isWall ? wallSvg : isFlower ? (flowerSvg || wallSvg) : catalogBall.svg,
    revived: Boolean(raw.revived),
    exploded: Boolean(raw.exploded),
    summonedWall: Boolean(raw.summonedWall),
    spearTriggered: Boolean(raw.spearTriggered),
    isWall,
    isFlower,
    growthStage:
      raw.growthStage === 'seed' || raw.growthStage === 'sprout' || raw.growthStage === 'bloomed'
        ? raw.growthStage
        : 'none',
    flowerSpawned: Boolean(raw.flowerSpawned),
    attacksMade: Math.max(0, Number(raw.attacksMade) || 0),
    turnCounter: Math.max(0, Number(raw.turnCounter) || 0),
    benchTurnCounter: Math.max(0, Number(raw.benchTurnCounter) || 0),
    parryCounter: Math.max(0, Number(raw.parryCounter) || 0),
    laserCharged: Boolean(raw.laserCharged),
    isHardened: Boolean(raw.isHardened),
    atkDebuffTurns: Math.max(0, Number(raw.atkDebuffTurns) || 0),
    atkMultiplier: Number(raw.atkMultiplier) || 1,
    missDebuffTurns: Math.max(0, Number(raw.missDebuffTurns) || 0),
    dead: Boolean(raw.dead) || hp <= 0,
  };
}

export function deserializeBattleState(snapshot, catalog, wallSvg, fallbackBallId, pickFallbackWord, flowerSvg = '') {
  if (!snapshot || typeof snapshot !== 'object') return null;
  if (!Array.isArray(snapshot.playerTeam) || !Array.isArray(snapshot.enemyTeam)) return null;
  if (snapshot.playerTeam.length === 0 || snapshot.enemyTeam.length === 0) return null;

  const playerTeam = snapshot.playerTeam
    .map((u) => deserializeUnit(u, catalog, wallSvg, fallbackBallId, flowerSvg))
    .filter(Boolean);
  const enemyTeam = snapshot.enemyTeam
    .map((u) => deserializeUnit(u, catalog, wallSvg, fallbackBallId, flowerSvg))
    .filter(Boolean);

  if (playerTeam.length === 0 || enemyTeam.length === 0) return null;
  const hasAlivePlayer = playerTeam.some((u) => !u.dead && !u.isWall);
  const hasAliveEnemy = enemyTeam.some((u) => !u.dead);
  if (!hasAlivePlayer || !hasAliveEnemy) return null;

  let currentWord =
    snapshot.currentWord &&
    typeof snapshot.currentWord.kana === 'string' &&
    typeof snapshot.currentWord.romaji === 'string' &&
    snapshot.currentWord.romaji.length > 0
      ? { kana: snapshot.currentWord.kana, romaji: snapshot.currentWord.romaji }
      : null;

  let typedIndex = Math.max(0, Math.floor(Number(snapshot.typedIndex) || 0));
  let wordHadMistake = Boolean(snapshot.wordHadMistake);

  if (!currentWord || typedIndex >= currentWord.romaji.length) {
    currentWord = typeof pickFallbackWord === 'function' ? pickFallbackWord(currentWord?.romaji || null) : currentWord;
    if (!currentWord || !currentWord.romaji) return null;
    typedIndex = 0;
    wordHadMistake = false;
  }

  const perfectStreak = Math.max(0, Math.floor(Number(snapshot.perfectStreak) || 0));
  const comboShield =
    perfectStreak > 0
      ? Math.max(1, Math.min(TYPING_SHIELD_MAX, Math.floor(Number(snapshot.comboShield) || 0)))
      : 0;

  return {
    battleSpeedIndex: Number(snapshot.battleSpeedIndex) === 1 ? 1 : 0,
    battleState: {
      playerTeam,
      enemyTeam,
      currentWord,
      typedIndex,
      perfectStreak,
      comboShield,
      wordHadMistake,
      wordsCompleted: Math.max(0, Math.floor(Number(snapshot.wordsCompleted) || 0)),
      perfectWordsCount: Math.max(0, Math.floor(Number(snapshot.perfectWordsCount) || 0)),
      maxMultiplierReached: Math.max(
        1,
        Number(snapshot.maxMultiplierReached) || getPerfectMultiplier(perfectStreak)
      ),
      turn: 'player',
      isResolvingTurn: false,
      rewardClaimed: false,
    },
  };
}
