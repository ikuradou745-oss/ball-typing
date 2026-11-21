export const TYPING_SHIELD_MAX = 5;

export function getPerfectMultiplier(streak) {
  const safeStreak = Number.isFinite(streak) && streak > 0 ? Math.floor(streak) : 0;
  return Math.min(5, Math.round((1 + safeStreak * 0.2) * 10) / 10);
}

export function createInitialTypingComboState() {
  return {
    wordHasMistake: false,
    perfectStreak: 0,
    comboShield: 0,
    perfectWordsCount: 0,
    wordsCompleted: 0,
    maxMultiplierReached: 1,
  };
}

export function applyTypingMistake(state) {
  const hasActiveBoost = state.perfectStreak > 0 && state.comboShield > 0;
  if (!hasActiveBoost) {
    return {
      outcome: 'no_shield_miss',
      state: {
        ...state,
        wordHasMistake: true,
        perfectStreak: 0,
        comboShield: 0,
      },
    };
  }

  const nextShield = Math.max(0, state.comboShield - 1);
  if (nextShield > 0) {
    return {
      outcome: 'shield_damaged',
      state: {
        ...state,
        comboShield: nextShield,
      },
    };
  }

  return {
    outcome: 'shield_broken',
    state: {
      ...state,
      wordHasMistake: true,
      perfectStreak: 0,
      comboShield: 0,
    },
  };
}

export function completeTypingWord(state) {
  const wordsCompleted = (state.wordsCompleted || 0) + 1;
  const hasActiveBoost = state.perfectStreak > 0 && state.comboShield > 0;

  let perfectStreak = 0;
  let comboShield = 0;
  let perfectWordsCount = state.perfectWordsCount || 0;
  let activatedBoost = false;
  let continuedBoost = false;

  if (hasActiveBoost) {
    perfectStreak = state.perfectStreak + 1;
    // Shield never heals while the attack boost combo continues.
    comboShield = state.comboShield;
    perfectWordsCount += 1;
    continuedBoost = true;
  } else if (!state.wordHasMistake) {
    perfectStreak = 1;
    comboShield = TYPING_SHIELD_MAX;
    perfectWordsCount += 1;
    activatedBoost = true;
  }

  const multiplier = getPerfectMultiplier(perfectStreak);
  const maxMultiplierReached = Math.max(state.maxMultiplierReached || 1, multiplier);

  return {
    multiplier,
    activatedBoost,
    continuedBoost,
    state: {
      ...state,
      perfectStreak,
      comboShield,
      perfectWordsCount,
      wordsCompleted,
      maxMultiplierReached,
    },
  };
}

export function prepareNextTypingWord(state) {
  return {
    ...state,
    wordHasMistake: false,
  };
}
