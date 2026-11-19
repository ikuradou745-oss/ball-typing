export const RARITY_STYLES = {
  common: {
    label: 'コモン',
    cardBg: '#DDE2E7',
  },
  uncommon: {
    label: 'アンコモン',
    cardBg: '#34D399',
  },
  rare: {
    label: 'レア',
    cardBg: '#38BDF8',
  },
  legend: {
    label: 'レジェンド',
    cardBg: '#F6C116',
  },
};

function createSpongeBallSvg() {
  return `
    <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
      <circle cx="32" cy="32" r="27" fill="#FACC15" stroke="#000000" stroke-width="4" />
      <!-- Cel-shaded bottom rim & top highlight -->
      <path d="M10 38 A24 24 0 0 0 54 38 A26 22 0 0 1 10 38 Z" fill="#CA8A04" opacity="0.48" />
      <circle cx="27" cy="25" r="18" fill="#FEF08A" opacity="0.42" />
      <!-- Sponge pores -->
      <circle cx="20" cy="25" r="3.6" fill="#B45309" opacity="0.5" />
      <circle cx="42" cy="21" r="2.8" fill="#B45309" opacity="0.46" />
      <circle cx="34" cy="37" r="4.2" fill="#B45309" opacity="0.5" />
      <circle cx="19" cy="41" r="2.5" fill="#B45309" opacity="0.42" />
      <circle cx="45" cy="40" r="3.2" fill="#B45309" opacity="0.46" />
      <circle cx="29" cy="17" r="2.2" fill="#B45309" opacity="0.38" />
      <!-- Glossy shine -->
      <ellipse cx="21" cy="15.5" rx="7" ry="3.6" transform="rotate(-26 21 15.5)" fill="#FFFFFF" opacity="0.82" />
      <circle cx="14.5" cy="21.5" r="2" fill="#FFFFFF" opacity="0.72" />
    </svg>
  `.trim();
}

function createRubberBallSvg() {
  return `
    <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
      <circle cx="32" cy="32" r="27" fill="#EF4444" stroke="#000000" stroke-width="4" />
      <!-- Cel-shaded bottom rim & top glow -->
      <path d="M10 38 A24 24 0 0 0 54 38 A26 22 0 0 1 10 38 Z" fill="#991B1B" opacity="0.52" />
      <circle cx="27" cy="24" r="17" fill="#FB7185" opacity="0.45" />
      <!-- Sporty rubber bounce band -->
      <path d="M10 25 Q32 35 54 25" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" opacity="0.92" />
      <path d="M11 40 Q32 30 53 40" fill="none" stroke="#FECACA" stroke-width="2.5" stroke-linecap="round" opacity="0.62" />
      <!-- Glossy rubber shine -->
      <ellipse cx="21" cy="15.5" rx="7.2" ry="3.8" transform="rotate(-25 21 15.5)" fill="#FFFFFF" opacity="0.85" />
      <circle cx="14.5" cy="22" r="2" fill="#FFFFFF" opacity="0.74" />
    </svg>
  `.trim();
}

function createRivalBallSvg() {
  return `
    <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
      <circle cx="32" cy="32" r="27" fill="#7C3AED" stroke="#000000" stroke-width="4" />
      <!-- Cel-shaded bottom rim & top glow -->
      <path d="M10 38 A24 24 0 0 0 54 38 A26 22 0 0 1 10 38 Z" fill="#4C1D95" opacity="0.55" />
      <circle cx="27" cy="24" r="17" fill="#A78BFA" opacity="0.42" />
      <path d="M14 36 L50 26" stroke="#1E1B4B" stroke-width="5" stroke-linecap="round" opacity="0.45" />
      <ellipse cx="21" cy="15.5" rx="7" ry="3.6" transform="rotate(-25 21 15.5)" fill="#FFFFFF" opacity="0.8" />
      <circle cx="14.5" cy="21.5" r="2" fill="#FFFFFF" opacity="0.7" />
    </svg>
  `.trim();
}

export const BALL_CATALOG = {
  sponge_ball: {
    id: 'sponge_ball',
    name: 'スポンジボール',
    rarity: 'common',
    level: 1,
    hp: 10,
    atk: 1,
    abilityTitle: '特殊能力',
    ability: '1度だけ死亡したとき、HPを最大HPの半分にして復活する。',
    svg: createSpongeBallSvg(),
  },
  rubber_ball: {
    id: 'rubber_ball',
    name: 'ゴムボール',
    rarity: 'common',
    level: 1,
    hp: 12,
    atk: 0.8,
    abilityTitle: '特殊能力',
    ability: '2回に1度、攻撃する際にダメージを1.5倍増加させます。',
    svg: createRubberBallSvg(),
  },
};

export function getCatalogBallsByRarity(rarity) {
  const list = Object.values(BALL_CATALOG).filter((ball) => ball.rarity === rarity);
  return list.length > 0 ? list : Object.values(BALL_CATALOG);
}

export const NPC_ENEMY_BALLS = [
  {
    id: 'rival_ball',
    name: 'ライバルボール',
    rarity: 'common',
    level: 1,
    hp: 10,
    atk: 1,
    svg: createRivalBallSvg(),
  },
];
