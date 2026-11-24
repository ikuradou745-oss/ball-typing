import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAttackFxSpec,
  getBurstColorSpec,
  getPersistentStatusClasses,
  getStartOfTurnStatusFxList,
} from '../lib/battleFxHelpers.js';

test('getPersistentStatusClasses maps burn, ice, stun, laser charge, and parry ready states', () => {
  const unit = {
    dead: false,
    ballId: 'sword_ball',
    parryCounter: 3,
    burnTurns: 2,
    iceTurns: 1,
    stunTurns: 1,
    laserCharged: true,
    isHardened: true,
  };
  const res = getPersistentStatusClasses(unit);
  assert.equal(res.hasBurn, true);
  assert.equal(res.hasIce, true);
  assert.equal(res.hasStun, true);
  assert.equal(res.isParryReady, true);
  assert.equal(res.isBlueLaserCharged, true);
  assert.ok(res.classes.includes('battle-unit-burning'));
  assert.ok(res.classes.includes('battle-unit-frozen'));
  assert.ok(res.classes.includes('battle-unit-stunned'));
  assert.ok(res.classes.includes('battle-unit-parry-ready'));
  assert.ok(res.classes.includes('battle-unit-laser-charged'));
  assert.ok(res.classes.includes('battle-unit-hardened'));

  const deadRes = getPersistentStatusClasses({ ...unit, dead: true });
  assert.deepEqual(deadRes.classes, []);
  assert.equal(deadRes.hasBurn, false);
});

test('getPersistentStatusClasses detects Red Laser charging vs ready states', () => {
  const charging = getPersistentStatusClasses({
    dead: false,
    ballId: 'red_laser_ball',
    turnCounter: 1,
  });
  assert.equal(charging.isRedLaserCharging, true);
  assert.equal(charging.isRedLaserReady, false);
  assert.ok(charging.classes.includes('battle-unit-red-laser-charging'));

  const ready = getPersistentStatusClasses({
    dead: false,
    ballId: 'red_laser_ball',
    turnCounter: 2,
  });
  assert.equal(ready.isRedLaserCharging, false);
  assert.equal(ready.isRedLaserReady, true);
  assert.ok(ready.classes.includes('battle-unit-red-laser-ready'));
});

test('getAttackFxSpec picks beam, magic spell, and normal projectile specs cleanly', () => {
  const blueLaser = getAttackFxSpec({
    ballId: 'laser_ball',
    isLaserShot: true,
    isRedLaserShot: false,
    chosenSpell: null,
  });
  assert.equal(blueLaser.kind, 'laser_beam');
  assert.equal(blueLaser.beamVariant, 'blue');
  assert.equal(blueLaser.burstVariant, 'laser');

  const redLaser = getAttackFxSpec({
    ballId: 'red_laser_ball',
    isLaserShot: false,
    isRedLaserShot: true,
    chosenSpell: null,
  });
  assert.equal(redLaser.kind, 'laser_beam');
  assert.equal(redLaser.beamVariant, 'red');
  assert.equal(redLaser.burstVariant, 'red-laser');

  const fireSpell = getAttackFxSpec({
    ballId: 'magician_ball',
    isLaserShot: false,
    isRedLaserShot: false,
    chosenSpell: { id: 'fire' },
  });
  assert.equal(fireSpell.kind, 'magic_spell');
  assert.equal(fireSpell.projectileVariant, 'fire');
  assert.equal(fireSpell.useThunderBolt, false);
  assert.equal(fireSpell.burstVariant, 'fire');

  const thunderSpell = getAttackFxSpec({
    ballId: 'magician_ball',
    isLaserShot: false,
    isRedLaserShot: false,
    chosenSpell: { id: 'thunder' },
  });
  assert.equal(thunderSpell.kind, 'magic_spell');
  assert.equal(thunderSpell.projectileVariant, null);
  assert.equal(thunderSpell.useThunderBolt, true);
  assert.equal(thunderSpell.burstVariant, 'thunder');

  const normal = getAttackFxSpec({
    ballId: 'sponge_ball',
    isLaserShot: false,
    isRedLaserShot: false,
    chosenSpell: null,
    isSuperJump: false,
  });
  assert.equal(normal.kind, 'projectile');
  assert.equal(normal.projectileVariant, 'normal');
});

test('getStartOfTurnStatusFxList builds FX entries for burn, ice, freeze lock, and stun lock', () => {
  const burnAndFreeze = getStartOfTurnStatusFxList({
    burnDamage: 1,
    iceDamage: 0.8,
    incapacitated: true,
    stunned: false,
  });
  assert.deepEqual(
    burnAndFreeze.map((item) => item.kind),
    ['burn_tick', 'ice_tick', 'ice_freeze']
  );

  const stunLock = getStartOfTurnStatusFxList({
    burnDamage: 0,
    iceDamage: 0,
    incapacitated: true,
    stunned: true,
  });
  assert.equal(stunLock.length, 1);
  assert.equal(stunLock[0].kind, 'stun_lock');
  assert.equal(stunLock[0].useThunderBolt, true);
});

test('getBurstColorSpec resolves elemental and fallback burst styles', () => {
  assert.equal(getBurstColorSpec('fire').outerFill, '#F97316');
  assert.equal(getBurstColorSpec('ice').outerFill, '#38BDF8');
  assert.equal(getBurstColorSpec('thunder').outerFill, '#FACC15');
  assert.equal(getBurstColorSpec('laser').outerFill, '#22D3EE');
  assert.equal(getBurstColorSpec('red-laser').outerFill, '#EF4444');
  assert.equal(getBurstColorSpec('unknown').outerFill, '#FACC15');
});
