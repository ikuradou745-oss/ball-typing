import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TYPING_SHIELD_MAX,
  applyTypingMistake,
  completeTypingWord,
  createInitialTypingComboState,
  getPerfectMultiplier,
  prepareNextTypingWord,
} from '../lib/typingComboHelpers.js';

test('TYPING_SHIELD_MAX is 5 and multiplier scales by +0.2 up to 5.0', () => {
  assert.equal(TYPING_SHIELD_MAX, 5);
  assert.equal(getPerfectMultiplier(0), 1);
  assert.equal(getPerfectMultiplier(1), 1.2);
  assert.equal(getPerfectMultiplier(2), 1.4);
  assert.equal(getPerfectMultiplier(20), 5);
  assert.equal(getPerfectMultiplier(30), 5);
});

test('cleanly completing a word when unboosted activates boost and grants shield 5', () => {
  const initial = createInitialTypingComboState();
  assert.equal(initial.comboShield, 0);
  assert.equal(initial.perfectStreak, 0);

  const res = completeTypingWord(initial);
  assert.equal(res.activatedBoost, true);
  assert.equal(res.continuedBoost, false);
  assert.equal(res.multiplier, 1.2);
  assert.equal(res.state.perfectStreak, 1);
  assert.equal(res.state.comboShield, 5);
  assert.equal(res.state.perfectWordsCount, 1);
  assert.equal(res.state.wordsCompleted, 1);
});

test('mistakes before boost activation block boost on that word and grant no shield', () => {
  let state = createInitialTypingComboState();
  const miss = applyTypingMistake(state);
  assert.equal(miss.outcome, 'no_shield_miss');
  assert.equal(miss.state.wordHasMistake, true);
  assert.equal(miss.state.comboShield, 0);
  assert.equal(miss.state.perfectStreak, 0);

  const finished = completeTypingWord(miss.state);
  assert.equal(finished.activatedBoost, false);
  assert.equal(finished.multiplier, 1);
  assert.equal(finished.state.perfectStreak, 0);
  assert.equal(finished.state.comboShield, 0);

  // Next clean word activates boost + shield 5
  state = prepareNextTypingWord(finished.state);
  const nextWord = completeTypingWord(state);
  assert.equal(nextWord.activatedBoost, true);
  assert.equal(nextWord.state.perfectStreak, 1);
  assert.equal(nextWord.state.comboShield, 5);
});

test('shield absorbs 4 mistakes (5 -> 4 -> 3 -> 2 -> 1) without ending boost or recovering across words', () => {
  let state = createInitialTypingComboState();
  state = prepareNextTypingWord(completeTypingWord(state).state);
  assert.equal(state.perfectStreak, 1);
  assert.equal(state.comboShield, 5);

  // 2 misses on word 2 -> shield drops to 3, boost stays active
  let missRes = applyTypingMistake(state);
  assert.equal(missRes.outcome, 'shield_damaged');
  state = missRes.state;
  assert.equal(state.comboShield, 4);
  assert.equal(state.perfectStreak, 1);

  missRes = applyTypingMistake(state);
  assert.equal(missRes.outcome, 'shield_damaged');
  state = missRes.state;
  assert.equal(state.comboShield, 3);
  assert.equal(state.perfectStreak, 1);

  // Complete word 2 -> boost advances to streak 2 (x1.4), shield remains 3 (never heals!)
  let word2 = completeTypingWord(state);
  assert.equal(word2.continuedBoost, true);
  assert.equal(word2.multiplier, 1.4);
  assert.equal(word2.state.perfectStreak, 2);
  assert.equal(word2.state.comboShield, 3);

  // Complete word 3 with zero mistakes -> streak 3 (x1.6), shield STILL stays 3
  state = prepareNextTypingWord(word2.state);
  const word3 = completeTypingWord(state);
  assert.equal(word3.multiplier, 1.6);
  assert.equal(word3.state.perfectStreak, 3);
  assert.equal(word3.state.comboShield, 3);
});

test('when shield reaches 0, combo breaks immediately and next clean word restarts shield at 5', () => {
  let state = createInitialTypingComboState();
  state = prepareNextTypingWord(completeTypingWord(state).state); // streak 1, shield 5

  // 4 misses reduce shield 5 -> 4 -> 3 -> 2 -> 1
  for (let expected = 4; expected >= 1; expected--) {
    const res = applyTypingMistake(state);
    assert.equal(res.outcome, 'shield_damaged');
    state = res.state;
    assert.equal(state.comboShield, expected);
    assert.equal(state.perfectStreak, 1);
  }

  // 5th miss breaks the shield (1 -> 0) and resets attack boost immediately
  const breakRes = applyTypingMistake(state);
  assert.equal(breakRes.outcome, 'shield_broken');
  state = breakRes.state;
  assert.equal(state.comboShield, 0);
  assert.equal(state.perfectStreak, 0);
  assert.equal(state.wordHasMistake, true);

  // Finishing the broken word keeps boost at 0 (x1.0)
  const afterBrokenWord = completeTypingWord(state);
  assert.equal(afterBrokenWord.multiplier, 1);
  assert.equal(afterBrokenWord.state.perfectStreak, 0);
  assert.equal(afterBrokenWord.state.comboShield, 0);

  // Completing a clean next word re-activates boost and restores shield to 5
  const nextCleanWord = completeTypingWord(prepareNextTypingWord(afterBrokenWord.state));
  assert.equal(nextCleanWord.activatedBoost, true);
  assert.equal(nextCleanWord.multiplier, 1.2);
  assert.equal(nextCleanWord.state.perfectStreak, 1);
  assert.equal(nextCleanWord.state.comboShield, 5);
});
