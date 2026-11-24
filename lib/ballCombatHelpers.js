export const RARITY_UPGRADE_CHANCES = Object.freeze({
  common: 0.1, // 10% -> uncommon when >= 6 common owned
  uncommon: 0.025, // 2.5% -> rare when >= 6 uncommon owned
  rare: 0.0125, // 1.25% -> super_rare when >= 6 rare owned
  super_rare: 0.005, // 0.5% -> legend (reserved)
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
  if (ballId === 'red_laser_ball' && turnCounter % 3 !== 0) return true;
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

export function computeSpearDeathStrike(dyingUnit, opposingTeam) {
  if (!dyingUnit || dyingUnit.ballId !== 'spear_ball' || dyingUnit.spearTriggered) {
    return [];
  }
  if (!Array.isArray(opposingTeam)) return [];
  const livingTargets = opposingTeam.filter((u) => u && !u.dead).slice(0, 2);
  if (livingTargets.length === 0) return [];
  dyingUnit.spearTriggered = true;
  const baseDamage = (Number(dyingUnit.atk) || 0) * 1.5;
  return livingTargets.map((target, idx) => {
    const rawDmg = target.isHardened ? baseDamage * 0.5 : baseDamage;
    return {
      target,
      position: idx === 0 ? 'front' : 'second',
      damage: roundStat(rawDmg),
      wasHalved: Boolean(target.isHardened),
    };
  });
}

export const MAGICIAN_SPELLS = Object.freeze({
  fire: {
    id: 'fire',
    label: '炎攻撃',
    atkMultiplier: 1.5,
    burnTurns: 2,
    iceTurns: 0,
    stunTurns: 0,
    summary: '攻撃力1.5倍 ＋ 2ターン火（毎ターン1ダメージ）',
  },
  ice: {
    id: 'ice',
    label: '氷攻撃',
    atkMultiplier: 1.0,
    burnTurns: 0,
    iceTurns: 3,
    stunTurns: 0,
    summary: '3ターン氷（毎ターン0.8ダメージ ＋ 35%で行動不能）',
  },
  thunder: {
    id: 'thunder',
    label: '雷攻撃',
    atkMultiplier: 1.3,
    burnTurns: 0,
    iceTurns: 0,
    stunTurns: 1,
    summary: '攻撃力1.3倍 ＋ 1ターンスタン（行動不能）',
  },
});

export function shouldTriggerMagicianSpell(attacker) {
  if (!attacker || attacker.dead || attacker.ballId !== 'magician_ball') return false;
  return ((attacker.attacksMade || 0) + 1) % 5 === 0;
}

export function pickRandomMagicianSpell(roll = Math.random()) {
  const keys = ['fire', 'ice', 'thunder'];
  const idx = Math.min(keys.length - 1, Math.max(0, Math.floor(roll * keys.length)));
  return keys[idx];
}

export function applyOneShotMistake(unit) {
  if (!unit || unit.dead || unit.ballId !== 'one_shot_ball') {
    return { triggered: false, damage: 0, died: false, lostAtkBoost: false };
  }
  const prevHp = Number(unit.hp) || 0;
  const nextHp = Math.max(0, roundStat(prevHp - 1));
  const actualDamage = roundStat(prevHp - nextHp);
  unit.hp = nextHp;

  let lostAtkBoost = false;
  if ((Number(unit.oneShotPerfectCount) || 0) > 0) {
    const baseAtk = Number(unit.baseAtk) > 0 ? Number(unit.baseAtk) : roundStat((Number(unit.atk) || 0) / 1.1);
    unit.baseAtk = baseAtk;
    unit.atk = roundStat(baseAtk);
    unit.oneShotPerfectCount = 0;
    lostAtkBoost = true;
  }

  if (nextHp <= 0) {
    unit.hp = 0;
    unit.dead = true;
  }
  return {
    triggered: true,
    damage: actualDamage,
    died: Boolean(unit.dead),
    lostAtkBoost,
  };
}

export function applyOneShotPerfect(unit) {
  if (!unit || unit.dead || unit.ballId !== 'one_shot_ball') {
    return { triggered: false, healed: 0, newAtk: unit?.atk || 0, atkBoostApplied: false };
  }
  const healed = applyHealToUnit(unit, 0.5);
  const alreadyBoosted = (Number(unit.oneShotPerfectCount) || 0) >= 1;
  const baseAtk =
    Number(unit.baseAtk) > 0
      ? Number(unit.baseAtk)
      : alreadyBoosted
        ? roundStat((Number(unit.atk) || 0) / 1.1)
        : Number(unit.atk) || 0;
  unit.baseAtk = baseAtk;

  if (!alreadyBoosted) {
    unit.atk = roundStat(baseAtk * 1.1);
    unit.oneShotPerfectCount = 1;
  } else {
    unit.atk = roundStat(baseAtk * 1.1);
    unit.oneShotPerfectCount = 1;
  }

  return {
    triggered: true,
    healed,
    newAtk: unit.atk,
    atkBoostApplied: !alreadyBoosted,
  };
}

export function processStartOfTurnStatuses(unit, iceFreezeRoll = Math.random()) {
  const result = {
    burnDamage: 0,
    iceDamage: 0,
    froze: false,
    stunned: false,
    died: false,
    incapacitated: false,
  };
  if (!unit || unit.dead) return result;

  if ((unit.burnTurns || 0) > 0) {
    unit.burnTurns -= 1;
    const prevHp = Number(unit.hp) || 0;
    const nextHp = Math.max(0, roundStat(prevHp - 1));
    result.burnDamage = roundStat(prevHp - nextHp);
    unit.hp = nextHp;
    if (nextHp <= 0) {
      unit.hp = 0;
      unit.dead = true;
      result.died = true;
      return result;
    }
  }

  if ((unit.iceTurns || 0) > 0) {
    unit.iceTurns -= 1;
    const prevHp = Number(unit.hp) || 0;
    const nextHp = Math.max(0, roundStat(prevHp - 0.8));
    result.iceDamage = roundStat(prevHp - nextHp);
    unit.hp = nextHp;
    if (nextHp <= 0) {
      unit.hp = 0;
      unit.dead = true;
      result.died = true;
      return result;
    }
    if (iceFreezeRoll < 0.35) {
      result.froze = true;
    }
  }

  if ((unit.stunTurns || 0) > 0) {
    unit.stunTurns -= 1;
    result.stunned = true;
  }

  result.incapacitated = result.froze || result.stunned;
  return result;
}
