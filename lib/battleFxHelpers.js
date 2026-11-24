export function getPersistentStatusClasses(unit) {
  if (!unit || unit.dead) {
    return {
      classes: [],
      hasBurn: false,
      hasIce: false,
      hasStun: false,
      isBlueLaserCharged: false,
      isRedLaserCharging: false,
      isRedLaserReady: false,
      isParryReady: false,
    };
  }

  const hasBurn = Number(unit.burnTurns || 0) > 0;
  const hasIce = Number(unit.iceTurns || 0) > 0;
  const hasStun = Number(unit.stunTurns || 0) > 0;
  const isBlueLaserCharged = Boolean(unit.laserCharged);
  const redCycle = Number(unit.turnCounter || 0) % 3;
  const isRedLaserCharging = unit.ballId === 'red_laser_ball' && redCycle === 1;
  const isRedLaserReady = unit.ballId === 'red_laser_ball' && redCycle === 2;
  const isParryReady = unit.ballId === 'sword_ball' && Number(unit.parryCounter || 0) % 4 === 3;

  const classes = [];
  if (unit.isHardened) classes.push('battle-unit-hardened');
  if (isBlueLaserCharged) classes.push('battle-unit-laser-charged');
  if (isRedLaserCharging) classes.push('battle-unit-red-laser-charging');
  if (isRedLaserReady) classes.push('battle-unit-red-laser-ready');
  if (isParryReady) classes.push('battle-unit-parry-ready');
  if (hasBurn) classes.push('battle-unit-burning');
  if (hasIce) classes.push('battle-unit-frozen');
  if (hasStun) classes.push('battle-unit-stunned');

  return {
    classes,
    hasBurn,
    hasIce,
    hasStun,
    isBlueLaserCharged,
    isRedLaserCharging,
    isRedLaserReady,
    isParryReady,
  };
}

export function getAttackFxSpec({ ballId, isLaserShot, isRedLaserShot, chosenSpell, isSuperJump }) {
  if (chosenSpell && chosenSpell.id) {
    const spellId = chosenSpell.id;
    return {
      kind: 'magic_spell',
      spellId,
      projectileVariant: spellId === 'thunder' ? null : spellId,
      useThunderBolt: spellId === 'thunder',
      beamVariant: null,
      burstVariant: spellId,
      castDelayMs: 280,
    };
  }

  if (isLaserShot) {
    return {
      kind: 'laser_beam',
      spellId: null,
      projectileVariant: null,
      useThunderBolt: false,
      beamVariant: 'blue',
      burstVariant: 'laser',
      castDelayMs: 240,
    };
  }

  if (isRedLaserShot || ballId === 'red_laser_ball') {
    return {
      kind: 'laser_beam',
      spellId: null,
      projectileVariant: null,
      useThunderBolt: false,
      beamVariant: 'red',
      burstVariant: 'red-laser',
      castDelayMs: 250,
    };
  }

  return {
    kind: 'projectile',
    spellId: null,
    projectileVariant: 'normal',
    useThunderBolt: false,
    beamVariant: null,
    burstVariant: 'normal',
    castDelayMs: isSuperJump ? 260 : 210,
  };
}

export function getStartOfTurnStatusFxList(statusOutcome) {
  if (!statusOutcome) return [];
  const fx = [];
  if (Number(statusOutcome.burnDamage || 0) > 0) {
    fx.push({
      kind: 'burn_tick',
      burstVariant: 'fire',
      overlayKind: 'burn-burst',
      useThunderBolt: false,
    });
  }
  if (Number(statusOutcome.iceDamage || 0) > 0) {
    fx.push({
      kind: 'ice_tick',
      burstVariant: 'ice',
      overlayKind: 'ice-burst',
      useThunderBolt: false,
    });
  }
  if (statusOutcome.incapacitated) {
    if (statusOutcome.stunned) {
      fx.push({
        kind: 'stun_lock',
        burstVariant: 'thunder',
        overlayKind: 'thunder-burst',
        useThunderBolt: true,
      });
    } else {
      fx.push({
        kind: 'ice_freeze',
        burstVariant: 'ice',
        overlayKind: 'ice-freeze',
        useThunderBolt: false,
      });
    }
  }
  return fx;
}

const BURST_COLOR_SPECS = {
  fire: {
    outerFill: '#F97316',
    innerFill: '#FEF08A',
    burstClass: 'battle-impact-burst-fire',
  },
  ice: {
    outerFill: '#38BDF8',
    innerFill: '#E0F2FE',
    burstClass: 'battle-impact-burst-ice',
  },
  thunder: {
    outerFill: '#FACC15',
    innerFill: '#FFFFFF',
    burstClass: 'battle-impact-burst-thunder',
  },
  laser: {
    outerFill: '#22D3EE',
    innerFill: '#FFFFFF',
    burstClass: 'battle-impact-burst-laser',
  },
  'red-laser': {
    outerFill: '#EF4444',
    innerFill: '#FEF08A',
    burstClass: 'battle-impact-burst-red-laser',
  },
  parry: {
    outerFill: '#FDE047',
    innerFill: '#FFFFFF',
    burstClass: 'battle-impact-burst-parry',
  },
  normal: {
    outerFill: '#FACC15',
    innerFill: '#FFFFFF',
    burstClass: '',
  },
};

export function getBurstColorSpec(variant = 'normal') {
  return BURST_COLOR_SPECS[variant] || BURST_COLOR_SPECS.normal;
}
