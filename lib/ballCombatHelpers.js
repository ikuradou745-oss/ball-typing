export const RARITY_UPGRADE_CHANCES = Object.freeze({
  common: 0.1, // 10% -> uncommon when >= 6 common owned
  uncommon: 0.025, // 2.5% -> rare when >= 6 uncommon owned
  rare: 0.0125, // 1.25% -> legend (reserved)
});

export function roundStat(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function formatStat(num) {
  const rounded = roundStat(num);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function getRarityUpgradeChance(baseRarity) {
  return RARITY_UPGRADE_CHANCES[baseRarity] || 0;
}

export function resolveEnemyTargetRarity(baseRarity, ownedOfBaseRarity, nextRarityExists, roll = Math.random()) {
  if (!nextRarityExists || ownedOfBaseRarity < 6) {
    return { upgraded: false, chance: 0 };
  }
  const chance = getRarityUpgradeChance(baseRarity);
  if (chance > 0 && roll < chance) {
    return { upgraded: true, chance };
  }
  return { upgraded: false, chance };
}

export function computeBandageSelfHeal(maxHp) {
  if (!Number.isFinite(maxHp) || maxHp <= 0) return 0;
  return Math.min(8, roundStat(maxHp * 0.18));
}

export function computeBandageAllyHeal(allyMaxHp) {
  if (!Number.isFinite(allyMaxHp) || allyMaxHp <= 0) return 0;
  return roundStat(allyMaxHp * 0.15);
}

export function applyHealToUnit(unit, rawHealAmount) {
  if (!unit || unit.dead || rawHealAmount <= 0) return 0;
  const nextHp = Math.min(unit.maxHp, roundStat(unit.hp + rawHealAmount));
  const healed = roundStat(nextHp - unit.hp);
  unit.hp = nextHp;
  return healed > 0 ? healed : 0;
}

export function resolveParryOnDefender(defender, incomingDamage, { isPhysical = true, isPiercing = false } = {}) {
  if (!defender || defender.dead || defender.ballId !== 'sword_ball') {
    return { parried: false, parryAttempted: false, bypassedByPierce: false, reflectedDamage: 0 };
  }
  defender.parryCounter = (defender.parryCounter || 0) + 1;
  if (defender.parryCounter % 4 !== 0) {
    return { parried: false, parryAttempted: false, bypassedByPierce: false, reflectedDamage: 0 };
  }
  // 4th incoming attack triggers Parry attempt!
  if (!isPhysical || isPiercing) {
    return { parried: false, parryAttempted: true, bypassedByPierce: true, reflectedDamage: 0 };
  }
  return {
    parried: true,
    parryAttempted: true,
    bypassedByPierce: false,
    reflectedDamage: roundStat(incomingDamage * 0.5),
  };
}

export function doesFrontAbilitySkipAttack(ballId, turnCounter) {
  if (!Number.isFinite(turnCounter) || turnCounter <= 0) return false;
  if (ballId === 'stone_ball' && turnCounter % 3 === 0) return true;
  if (ballId === 'laser_ball' && turnCounter % 3 === 0) return true;
  return false;
}

export function advanceTreeBallGrowth(unit) {
  if (!unit || unit.dead || unit.ballId !== 'tree_ball' || unit.flowerSpawned) {
    return {
      stage: unit?.growthStage || 'none',
      changed: false,
      shouldSpawnFlower: false,
    };
  }
  if (unit.turnCounter === 1) {
    unit.growthStage = 'seed';
    return { stage: 'seed', changed: true, shouldSpawnFlower: false };
  }
  if (unit.turnCounter === 2) {
    unit.growthStage = 'sprout';
    return { stage: 'sprout', changed: true, shouldSpawnFlower: false };
  }
  if (unit.turnCounter >= 3) {
    unit.growthStage = 'bloomed';
    unit.flowerSpawned = true;
    return { stage: 'bloomed', changed: true, shouldSpawnFlower: true };
  }
  return {
    stage: unit.growthStage || 'none',
    changed: false,
    shouldSpawnFlower: false,
  };
}

export function clearTreeGrowthOnDefeat(unit) {
  if (!unit || unit.ballId !== 'tree_ball') return false;
  if (!unit.flowerSpawned && unit.growthStage && unit.growthStage !== 'none') {
    unit.growthStage = 'none';
    return true;
  }
  return false;
}

