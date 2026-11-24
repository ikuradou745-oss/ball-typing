export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'super_rare', 'legend'];

export const RARITY_STYLES = {
  common: {
    label: 'コモン',
    cardBg: '#DDE2E7',
    tier: 0,
  },
  uncommon: {
    label: 'アンコモン',
    cardBg: '#34D399',
    tier: 1,
  },
  rare: {
    label: 'レア',
    cardBg: '#38BDF8',
    tier: 2,
  },
  super_rare: {
    label: 'スーパーレア',
    cardBg: '#A3E635',
    tier: 3,
  },
  legend: {
    label: 'レジェンド',
    cardBg: '#F6C116',
    tier: 4,
  },
};

function createSpongeBallSvg() {
  return `
    <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
      <circle cx="32" cy="32" r="27" fill="#FACC15" stroke="#000000" stroke-width="4" />
      <path d="M10 38 A24 24 0 0 0 54 38 A26 22 0 0 1 10 38 Z" fill="#CA8A04" opacity="0.48" />
      <circle cx="27" cy="25" r="18" fill="#FEF08A" opacity="0.42" />
      <circle cx="20" cy="25" r="3.6" fill="#B45309" opacity="0.5" />
      <circle cx="42" cy="21" r="2.8" fill="#B45309" opacity="0.46" />
      <circle cx="34" cy="37" r="4.2" fill="#B45309" opacity="0.5" />
      <circle cx="19" cy="41" r="2.5" fill="#B45309" opacity="0.42" />
      <circle cx="45" cy="40" r="3.2" fill="#B45309" opacity="0.46" />
      <circle cx="29" cy="17" r="2.2" fill="#B45309" opacity="0.38" />
      <ellipse cx="21" cy="15.5" rx="7" ry="3.6" transform="rotate(-26 21 15.5)" fill="#FFFFFF" opacity="0.82" />
      <circle cx="14.5" cy="21.5" r="2" fill="#FFFFFF" opacity="0.72" />
    </svg>
  `.trim();
}

function createRubberBallSvg() {
  return `
    <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
      <circle cx="32" cy="32" r="27" fill="#EF4444" stroke="#000000" stroke-width="4" />
      <path d="M10 38 A24 24 0 0 0 54 38 A26 22 0 0 1 10 38 Z" fill="#991B1B" opacity="0.52" />
      <circle cx="27" cy="24" r="17" fill="#FB7185" opacity="0.45" />
      <path d="M10 25 Q32 35 54 25" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" opacity="0.92" />
      <path d="M11 40 Q32 30 53 40" fill="none" stroke="#FECACA" stroke-width="2.5" stroke-linecap="round" opacity="0.62" />
      <ellipse cx="21" cy="15.5" rx="7.2" ry="3.8" transform="rotate(-25 21 15.5)" fill="#FFFFFF" opacity="0.85" />
      <circle cx="14.5" cy="22" r="2" fill="#FFFFFF" opacity="0.74" />
    </svg>
  `.trim();
}

function createPlasticBallSvg() {
  return `
    <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
      <circle cx="32" cy="32" r="27" fill="#38BDF8" stroke="#000000" stroke-width="4" />
      <path d="M10 38 A24 24 0 0 0 54 38 A26 22 0 0 1 10 38 Z" fill="#0284C7" opacity="0.5" />
      <circle cx="32" cy="32" r="20" fill="#BAE6FD" opacity="0.38" />
      <circle cx="32" cy="32" r="12" fill="none" stroke="#FFFFFF" stroke-width="2.5" opacity="0.55" />
      <ellipse cx="20.5" cy="15.5" rx="8" ry="4" transform="rotate(-28 20.5 15.5)" fill="#FFFFFF" opacity="0.92" />
      <circle cx="13.5" cy="23" r="2.3" fill="#FFFFFF" opacity="0.82" />
    </svg>
  `.trim();
}

function createSuperBallSvg() {
  return `
    <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
      <circle cx="32" cy="32" r="27" fill="#A855F7" stroke="#000000" stroke-width="4" />
      <path d="M10 38 A24 24 0 0 0 54 38 A26 22 0 0 1 10 38 Z" fill="#6B21A8" opacity="0.52" />
      <!-- Neon swirl stripes -->
      <path d="M13 20 Q28 32 51 20" fill="none" stroke="#2DD4BF" stroke-width="4.5" stroke-linecap="round" />
      <path d="M11 35 Q32 22 53 35" fill="none" stroke="#F6C116" stroke-width="4" stroke-linecap="round" />
      <path d="M16 47 Q34 38 49 47" fill="none" stroke="#FB7185" stroke-width="3.5" stroke-linecap="round" />
      <ellipse cx="21" cy="15" rx="7" ry="3.6" transform="rotate(-25 21 15)" fill="#FFFFFF" opacity="0.88" />
      <circle cx="14.5" cy="21.5" r="2" fill="#FFFFFF" opacity="0.78" />
    </svg>
  `.trim();
}

function createStoneBallSvg() {
  return `
    <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
      <circle cx="32" cy="32" r="27" fill="#94A3B8" stroke="#000000" stroke-width="4" />
      <path d="M10 38 A24 24 0 0 0 54 38 A26 22 0 0 1 10 38 Z" fill="#475569" opacity="0.62" />
      <polygon points="18,16 32,12 42,22 28,28" fill="#CBD5E1" opacity="0.6" />
      <polygon points="36,34 50,30 48,44 34,46" fill="#64748B" opacity="0.55" />
      <!-- Rock cracks -->
      <path d="M22 28 L30 35 L26 45" fill="none" stroke="#1E293B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.7" />
      <path d="M30 35 L40 33" fill="none" stroke="#1E293B" stroke-width="2" stroke-linecap="round" opacity="0.6" />
      <ellipse cx="22" cy="15.5" rx="6.5" ry="3.2" transform="rotate(-22 22 15.5)" fill="#FFFFFF" opacity="0.58" />
    </svg>
  `.trim();
}

function createGrassBallSvg() {
  return `
    <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
      <circle cx="32" cy="34" r="25" fill="#22C55E" stroke="#000000" stroke-width="4" />
      <path d="M12 40 A22 22 0 0 0 52 40 A24 20 0 0 1 12 40 Z" fill="#15803D" opacity="0.56" />
      <circle cx="27" cy="27" r="15" fill="#86EFAC" opacity="0.38" />
      <!-- Leaf sprout on top -->
      <path d="M32 12 C28 4 19 4 19 10 C23 13 28 13 32 12 Z" fill="#4ADE80" stroke="#000000" stroke-width="2.5" stroke-linejoin="round" />
      <path d="M32 12 C36 3 46 4 45 11 C40 14 36 13 32 12 Z" fill="#16A34A" stroke="#000000" stroke-width="2.5" stroke-linejoin="round" />
      <!-- Botanical swirl & shine -->
      <path d="M16 38 Q28 44 44 34" fill="none" stroke="#166534" stroke-width="2.8" stroke-linecap="round" opacity="0.55" />
      <ellipse cx="21" cy="21" rx="6.2" ry="3.2" transform="rotate(-24 21 21)" fill="#FFFFFF" opacity="0.8" />
    </svg>
  `.trim();
}

function createWoodBallSvg() {
  return `
    <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
      <circle cx="32" cy="32" r="27" fill="#D97706" stroke="#000000" stroke-width="4" />
      <path d="M10 38 A24 24 0 0 0 54 38 A26 22 0 0 1 10 38 Z" fill="#92400E" opacity="0.55" />
      <circle cx="28" cy="26" r="17" fill="#FCD34D" opacity="0.32" />
      <!-- Wood grain lines and knot -->
      <path d="M12 24 Q28 18 52 24" fill="none" stroke="#78350F" stroke-width="2.6" stroke-linecap="round" opacity="0.72" />
      <path d="M9 34 Q30 41 55 33" fill="none" stroke="#78350F" stroke-width="2.6" stroke-linecap="round" opacity="0.72" />
      <path d="M16 45 Q32 50 48 45" fill="none" stroke="#78350F" stroke-width="2.4" stroke-linecap="round" opacity="0.65" />
      <ellipse cx="38" cy="28" rx="4.2" ry="2.8" fill="#B45309" stroke="#78350F" stroke-width="1.8" />
      <ellipse cx="21" cy="15.5" rx="6.8" ry="3.4" transform="rotate(-24 21 15.5)" fill="#FFFFFF" opacity="0.75" />
    </svg>
  `.trim();
}

export const WOOD_WALL_SVG = `
  <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
    <rect x="11" y="10" width="42" height="46" rx="6" fill="#B45309" stroke="#000000" stroke-width="4" />
    <rect x="15" y="14" width="11" height="38" rx="2" fill="#D97706" stroke="#78350F" stroke-width="2" />
    <rect x="27" y="14" width="10" height="38" rx="2" fill="#F59E0B" stroke="#78350F" stroke-width="2" />
    <rect x="38" y="14" width="11" height="38" rx="2" fill="#D97706" stroke="#78350F" stroke-width="2" />
    <rect x="9" y="21" width="46" height="7" rx="2" fill="#92400E" stroke="#000000" stroke-width="2.5" />
    <rect x="9" y="40" width="46" height="7" rx="2" fill="#92400E" stroke="#000000" stroke-width="2.5" />
    <circle cx="15" cy="24.5" r="1.7" fill="#E2E8F0" />
    <circle cx="49" cy="24.5" r="1.7" fill="#E2E8F0" />
    <circle cx="15" cy="43.5" r="1.7" fill="#E2E8F0" />
    <circle cx="49" cy="43.5" r="1.7" fill="#E2E8F0" />
  </svg>
`.trim();

function createLaserBallSvg() {
  return `
    <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
      <circle cx="32" cy="32" r="27" fill="#0EA5E9" stroke="#000000" stroke-width="4" />
      <path d="M10 38 A24 24 0 0 0 54 38 A26 22 0 0 1 10 38 Z" fill="#0369A1" opacity="0.58" />
      <circle cx="32" cy="32" r="19" fill="#38BDF8" opacity="0.48" />
      <!-- Metallic emitter rings -->
      <circle cx="32" cy="32" r="13" fill="#0F172A" stroke="#000000" stroke-width="2.5" />
      <circle cx="32" cy="32" r="8.5" fill="#22D3EE" stroke="#E0F2FE" stroke-width="2" />
      <circle cx="32" cy="32" r="4" fill="#FFFFFF" />
      <!-- Laser beam flares -->
      <path d="M8 32 L18 32 M46 32 L58 32" stroke="#BAE6FD" stroke-width="4" stroke-linecap="round" />
      <path d="M47 26 L57 22 M47 38 L57 42" stroke="#7DD3FC" stroke-width="2.5" stroke-linecap="round" />
      <ellipse cx="20" cy="15" rx="6.8" ry="3.2" transform="rotate(-25 20 15)" fill="#FFFFFF" opacity="0.86" />
    </svg>
  `.trim();
}

function createSwordBallSvg() {
  return `
    <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
      <circle cx="30" cy="34" r="24" fill="#64748B" stroke="#000000" stroke-width="4" />
      <path d="M10 40 A21 21 0 0 0 50 40 A23 19 0 0 1 10 40 Z" fill="#334155" opacity="0.62" />
      <circle cx="26" cy="28" r="15" fill="#CBD5E1" opacity="0.42" />
      <!-- Knight visor slit -->
      <path d="M16 33 Q30 37 44 31" fill="none" stroke="#0F172A" stroke-width="3.5" stroke-linecap="round" />
      <!-- Diagonal gleaming sword across ball -->
      <g transform="rotate(-38 35 29)">
        <polygon points="35,4 39,14 38,38 32,38 31,14" fill="#E0F2FE" stroke="#000000" stroke-width="2.8" stroke-linejoin="round" />
        <line x1="35" y1="10" x2="35" y2="36" stroke="#38BDF8" stroke-width="1.8" />
        <rect x="27" y="37" width="16" height="4.5" rx="2" fill="#F6C116" stroke="#000000" stroke-width="2.2" />
        <rect x="33" y="41.5" width="4" height="8" rx="1.5" fill="#92400E" stroke="#000000" stroke-width="2" />
        <circle cx="35" cy="51" r="3" fill="#F6C116" stroke="#000000" stroke-width="2" />
      </g>
      <ellipse cx="19" cy="19" rx="5.5" ry="2.8" transform="rotate(-24 19 19)" fill="#FFFFFF" opacity="0.82" />
    </svg>
  `.trim();
}

function createBandageBallSvg() {
  return `
    <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
      <circle cx="32" cy="32" r="27" fill="#FDE68A" stroke="#000000" stroke-width="4" />
      <path d="M10 38 A24 24 0 0 0 54 38 A26 22 0 0 1 10 38 Z" fill="#F59E0B" opacity="0.34" />
      <circle cx="27" cy="25" r="17" fill="#FEF3C7" opacity="0.55" />
      <!-- Crossed adhesive bandages -->
      <g transform="rotate(-28 32 32)">
        <rect x="13" y="24" width="38" height="16" rx="7" fill="#FFFBEB" stroke="#000000" stroke-width="3" />
        <rect x="24" y="25.5" width="16" height="13" rx="2" fill="#FDBA74" opacity="0.72" />
        <circle cx="19" cy="29" r="1.2" fill="#92400E" />
        <circle cx="19" cy="35" r="1.2" fill="#92400E" />
        <circle cx="45" cy="29" r="1.2" fill="#92400E" />
        <circle cx="45" cy="35" r="1.2" fill="#92400E" />
      </g>
      <!-- Green medical healing cross -->
      <path d="M29.5 27 H34.5 V30.5 H38 V35.5 H34.5 V39 H29.5 V35.5 H26 V30.5 H29.5 Z" fill="#22C55E" stroke="#000000" stroke-width="1.8" stroke-linejoin="round" />
      <ellipse cx="20.5" cy="15.5" rx="6.8" ry="3.2" transform="rotate(-26 20.5 15.5)" fill="#FFFFFF" opacity="0.86" />
    </svg>
  `.trim();
}

function createTreeBallSvg() {
  return `
    <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
      <circle cx="32" cy="33" r="26" fill="#22C55E" stroke="#000000" stroke-width="4" />
      <path d="M11 40 A23 23 0 0 0 53 40 A25 21 0 0 1 11 40 Z" fill="#15803D" opacity="0.58" />
      <!-- Leafy crown puffs -->
      <circle cx="21" cy="22" r="9.5" fill="#4ADE80" stroke="#000000" stroke-width="2.5" />
      <circle cx="43" cy="22" r="9.5" fill="#16A34A" stroke="#000000" stroke-width="2.5" />
      <circle cx="32" cy="17" r="11" fill="#4ADE80" stroke="#000000" stroke-width="2.5" />
      <!-- Tree trunk inside ball -->
      <path d="M26 56 L28 34 L22 28 M38 56 L36 34 L42 28" fill="none" stroke="#78350F" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
      <rect x="27" y="34" width="10" height="22" rx="3" fill="#92400E" stroke="#000000" stroke-width="2.5" />
      <!-- Cute seed & leaf highlights -->
      <circle cx="26" cy="15" r="3" fill="#BBF7D0" opacity="0.85" />
      <ellipse cx="21" cy="14" rx="4.5" ry="2.2" transform="rotate(-22 21 14)" fill="#FFFFFF" opacity="0.78" />
    </svg>
  `.trim();
}

export const SEED_UNIT_SVG = `
  <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
    <!-- Soil mound -->
    <ellipse cx="32" cy="53" rx="22" ry="6.5" fill="#92400E" stroke="#000000" stroke-width="3" />
    <!-- Tiny green tip peeking out -->
    <path d="M32 23 C28 15 35 12 37 18 C37 21 34 23 32 23 Z" fill="#4ADE80" stroke="#000000" stroke-width="2.4" stroke-linejoin="round" />
    <!-- Plump planted seed -->
    <path d="M32 22 C43 24 47 36 43 46 C39 52 25 52 21 46 C17 36 21 24 32 22 Z" fill="#D97706" stroke="#000000" stroke-width="3.4" stroke-linejoin="round" />
    <path d="M32 24 C38 26 41 35 38 44 C36 47 31 48 28 47" fill="none" stroke="#92400E" stroke-width="2.2" stroke-linecap="round" opacity="0.6" />
    <ellipse cx="26.5" cy="31" rx="3.2" ry="5" transform="rotate(-16 26.5 31)" fill="#FDE68A" opacity="0.78" />
  </svg>
`.trim();

export const SPROUT_UNIT_SVG = `
  <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
    <!-- Soil mound -->
    <ellipse cx="32" cy="54" rx="22" ry="6.5" fill="#92400E" stroke="#000000" stroke-width="3" />
    <!-- Stem -->
    <path d="M32 52 Q32 38 32 29" fill="none" stroke="#15803D" stroke-width="5" stroke-linecap="round" />
    <!-- Left & Right cotyledon leaves (子葉) -->
    <path d="M32 32 C22 20 8 22 10 31 C13 38 25 38 32 32 Z" fill="#4ADE80" stroke="#000000" stroke-width="3" stroke-linejoin="round" />
    <path d="M32 32 C42 19 56 22 54 31 C51 38 39 38 32 32 Z" fill="#22C55E" stroke="#000000" stroke-width="3" stroke-linejoin="round" />
    <!-- Leaf veins & dew shine -->
    <path d="M16 30 Q24 30 30 32" fill="none" stroke="#166534" stroke-width="2" stroke-linecap="round" opacity="0.65" />
    <path d="M48 30 Q40 30 34 32" fill="none" stroke="#14532D" stroke-width="2" stroke-linecap="round" opacity="0.65" />
    <ellipse cx="19" cy="26.5" rx="3.4" ry="1.8" transform="rotate(-15 19 26.5)" fill="#FFFFFF" opacity="0.8" />
    <ellipse cx="44" cy="26" rx="3.4" ry="1.8" transform="rotate(15 44 26)" fill="#FFFFFF" opacity="0.7" />
  </svg>
`.trim();

export const FLOWER_UNIT_SVG = `
  <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
    <!-- Stem and leaves -->
    <path d="M32 36 V57" stroke="#15803D" stroke-width="5" stroke-linecap="round" />
    <path d="M32 49 C23 44 17 47 18 52 C23 55 29 53 32 49 Z" fill="#4ADE80" stroke="#000000" stroke-width="2.5" stroke-linejoin="round" />
    <path d="M32 47 C41 42 47 45 46 50 C41 53 35 51 32 47 Z" fill="#22C55E" stroke="#000000" stroke-width="2.5" stroke-linejoin="round" />
    <!-- Flower petals -->
    <circle cx="32" cy="16" r="9.5" fill="#F472B6" stroke="#000000" stroke-width="3" />
    <circle cx="44" cy="24" r="9.5" fill="#FB7185" stroke="#000000" stroke-width="3" />
    <circle cx="40" cy="36" r="9.5" fill="#F472B6" stroke="#000000" stroke-width="3" />
    <circle cx="24" cy="36" r="9.5" fill="#FB7185" stroke="#000000" stroke-width="3" />
    <circle cx="20" cy="24" r="9.5" fill="#F472B6" stroke="#000000" stroke-width="3" />
    <!-- Center bud -->
    <circle cx="32" cy="27" r="9.5" fill="#FACC15" stroke="#000000" stroke-width="3.2" />
    <circle cx="29" cy="24" r="2.2" fill="#FFFFFF" opacity="0.85" />
  </svg>
`.trim();

function createSpearBallSvg() {
  return `
    <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
      <circle cx="32" cy="34" r="24" fill="#38BDF8" stroke="#000000" stroke-width="4" />
      <path d="M11 40 A21 21 0 0 0 53 40 A23 19 0 0 1 11 40 Z" fill="#0369A1" opacity="0.58" />
      <circle cx="27" cy="28" r="15" fill="#BAE6FD" opacity="0.45" />
      <!-- Gleaming lance/spear piercing diagonally -->
      <g transform="rotate(-38 33 30)">
        <rect x="31" y="20" width="4.5" height="34" rx="2" fill="#92400E" stroke="#000000" stroke-width="2.2" />
        <rect x="27" y="18" width="12.5" height="4.5" rx="2" fill="#F6C116" stroke="#000000" stroke-width="2.2" />
        <polygon points="33.25,2 40,18 26.5,18" fill="#F8FAFC" stroke="#000000" stroke-width="2.8" stroke-linejoin="round" />
        <line x1="33.25" y1="6" x2="33.25" y2="16.5" stroke="#38BDF8" stroke-width="2" stroke-linecap="round" />
      </g>
      <ellipse cx="20" cy="19" rx="5.6" ry="2.8" transform="rotate(-24 20 19)" fill="#FFFFFF" opacity="0.84" />
    </svg>
  `.trim();
}

function createRedLaserBallSvg() {
  return `
    <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
      <circle cx="32" cy="32" r="27" fill="#EF4444" stroke="#000000" stroke-width="4" />
      <path d="M10 38 A24 24 0 0 0 54 38 A26 22 0 0 1 10 38 Z" fill="#991B1B" opacity="0.62" />
      <circle cx="32" cy="32" r="19" fill="#FB7185" opacity="0.46" />
      <!-- High-output crimson emitter core -->
      <circle cx="32" cy="32" r="13.5" fill="#111827" stroke="#000000" stroke-width="2.5" />
      <circle cx="32" cy="32" r="9" fill="#DC2626" stroke="#FCA5A5" stroke-width="2" />
      <circle cx="32" cy="32" r="4.2" fill="#FEF08A" />
      <!-- Heavy crimson laser flares -->
      <path d="M7 32 L17.5 32 M46.5 32 L59 32" stroke="#FEF08A" stroke-width="4.4" stroke-linecap="round" />
      <path d="M47 25 L57 20 M47 39 L57 44" stroke="#FCA5A5" stroke-width="2.8" stroke-linecap="round" />
      <ellipse cx="20" cy="15" rx="6.8" ry="3.2" transform="rotate(-25 20 15)" fill="#FFFFFF" opacity="0.86" />
    </svg>
  `.trim();
}

function createOneShotBallSvg() {
  return `
    <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
      <circle cx="32" cy="32" r="27" fill="#F59E0B" stroke="#000000" stroke-width="4" />
      <path d="M10 38 A24 24 0 0 0 54 38 A26 22 0 0 1 10 38 Z" fill="#B45309" opacity="0.56" />
      <!-- Target concentric bullseye rings -->
      <circle cx="32" cy="32" r="19" fill="#FFFBEB" stroke="#000000" stroke-width="2.6" />
      <circle cx="32" cy="32" r="12.5" fill="#EF4444" stroke="#000000" stroke-width="2.4" />
      <circle cx="32" cy="32" r="5.5" fill="#FDE047" stroke="#000000" stroke-width="2" />
      <!-- Precision crosshair lines -->
      <path d="M32 6 V18 M32 46 V58 M6 32 H18 M46 32 H58" stroke="#000000" stroke-width="3.2" stroke-linecap="round" />
      <path d="M32 6 V18 M32 46 V58 M6 32 H18 M46 32 H58" stroke="#FEF08A" stroke-width="1.5" stroke-linecap="round" />
      <ellipse cx="20" cy="15" rx="6" ry="2.8" transform="rotate(-24 20 15)" fill="#FFFFFF" opacity="0.85" />
    </svg>
  `.trim();
}

function createMagicianBallSvg() {
  return `
    <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
      <!-- Orbiting elemental orbs (Fire, Ice, Thunder) -->
      <circle cx="11" cy="36" r="5.5" fill="#EF4444" stroke="#000000" stroke-width="2.2" />
      <circle cx="53" cy="36" r="5.5" fill="#38BDF8" stroke="#000000" stroke-width="2.2" />
      <circle cx="50" cy="17" r="4.8" fill="#FACC15" stroke="#000000" stroke-width="2.2" />
      <!-- Mage body -->
      <circle cx="32" cy="38" r="21" fill="#7C3AED" stroke="#000000" stroke-width="4" />
      <path d="M13 43 A20 20 0 0 0 51 43 A22 18 0 0 1 13 43 Z" fill="#4C1D95" opacity="0.58" />
      <!-- Glowing mage eyes -->
      <ellipse cx="25.5" cy="38.5" rx="2.6" ry="3.4" fill="#FDE047" />
      <ellipse cx="38.5" cy="38.5" rx="2.6" ry="3.4" fill="#FDE047" />
      <!-- Wizard Hat -->
      <path d="M10 26 Q32 20 54 26 Q32 30 10 26 Z" fill="#312E81" stroke="#000000" stroke-width="3" stroke-linejoin="round" />
      <path d="M19 24 L31 4 L45 24 Z" fill="#4338CA" stroke="#000000" stroke-width="3" stroke-linejoin="round" />
      <path d="M20 22 Q32 24.5 44 22" fill="none" stroke="#F6C116" stroke-width="3.2" stroke-linecap="round" />
      <!-- Star emblem on hat -->
      <polygon points="32,11 33.8,14.8 38,15.3 34.8,18 35.6,22 32,20 28.4,22 29.2,18 26,15.3 30.2,14.8" fill="#FDE047" stroke="#000000" stroke-width="1.2" stroke-linejoin="round" />
    </svg>
  `.trim();
}

function createRivalBallSvg() {
  return `
    <svg viewBox="0 0 64 64" class="ball-vector-svg" aria-hidden="true">
      <circle cx="32" cy="32" r="27" fill="#7C3AED" stroke="#000000" stroke-width="4" />
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
    attributes: [],
    piercing: false,
    isPhysical: true,
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
    attributes: [],
    piercing: false,
    isPhysical: true,
    abilityTitle: '特殊能力',
    ability: '2回に1度、攻撃する際にダメージを1.5倍増加させます。',
    svg: createRubberBallSvg(),
  },
  plastic_ball: {
    id: 'plastic_ball',
    name: 'プラスチックボール',
    rarity: 'common',
    level: 1,
    hp: 8,
    atk: 0.7,
    attributes: [],
    piercing: false,
    isPhysical: true,
    abilityTitle: '特殊能力',
    ability: '死亡時に膨らんで爆発し、攻撃力の3倍のダメージを与えます。',
    svg: createPlasticBallSvg(),
  },
  super_ball: {
    id: 'super_ball',
    name: 'スーパーボール',
    rarity: 'uncommon',
    level: 1,
    hp: 12,
    atk: 1,
    attributes: [],
    piercing: false,
    isPhysical: true,
    abilityTitle: '特殊能力',
    ability: '攻撃時に3回に1度、特大ジャンプで攻撃し、相手の攻撃力を2ターン75%（-25%）にする。',
    svg: createSuperBallSvg(),
  },
  stone_ball: {
    id: 'stone_ball',
    name: '石ボール',
    rarity: 'uncommon',
    level: 1,
    hp: 15,
    atk: 0.5,
    attributes: [],
    piercing: false,
    isPhysical: true,
    abilityTitle: '特殊能力',
    ability: '3ターンに1度「固まる」状態になり、受けるダメージを半分カットできる（そのターンは攻撃できない）。',
    svg: createStoneBallSvg(),
  },
  grass_ball: {
    id: 'grass_ball',
    name: '草ボール',
    rarity: 'uncommon',
    level: 1,
    hp: 10,
    atk: 1.4,
    attributes: [],
    piercing: false,
    isPhysical: true,
    abilityTitle: '特殊能力',
    ability: '4ターンに1度「しげみ」攻撃を行い、相手は2ターン、攻撃を50%で外すようになる。',
    svg: createGrassBallSvg(),
  },
  wood_ball: {
    id: 'wood_ball',
    name: '木材ボール',
    rarity: 'uncommon',
    level: 1,
    hp: 9,
    atk: 1.1,
    attributes: [],
    piercing: false,
    isPhysical: true,
    abilityTitle: '特殊能力',
    ability: '死亡時、最大HPの半分のHPを持つ壁を召喚する。（味方の先頭のボールは動ける）',
    svg: createWoodBallSvg(),
  },
  laser_ball: {
    id: 'laser_ball',
    name: 'ブルーレーザーボール',
    rarity: 'rare',
    level: 1,
    hp: 15,
    atk: 1.5,
    attributes: ['貫通'],
    piercing: true,
    isPhysical: false,
    abilityTitle: '特殊能力（属性：貫通）',
    ability: '3回に1度攻撃せずにレーザーを貯めて、次の攻撃のダメージが2.5倍になる。レーザーは物理攻撃ではないため、パリィを無視して貫通する。',
    svg: createLaserBallSvg(),
  },
  sword_ball: {
    id: 'sword_ball',
    name: 'ソードボール',
    rarity: 'rare',
    level: 1,
    hp: 12,
    atk: 1.7,
    attributes: [],
    piercing: false,
    isPhysical: true,
    abilityTitle: '特殊能力',
    ability: '4回に1度、相手の物理攻撃をパリィして受けたダメージの半分を相手に跳ね返す。（「貫通」属性や物理以外の攻撃はパリィできない）',
    svg: createSwordBallSvg(),
  },
  bandage_ball: {
    id: 'bandage_ball',
    name: '絆創膏ボール',
    rarity: 'rare',
    level: 1,
    hp: 16,
    atk: 0.9,
    attributes: [],
    piercing: false,
    isPhysical: true,
    abilityTitle: '特殊能力',
    ability: '4ターンに1度、自分のHPを最大HPの18%回復できる（最大8まで）。また、先頭にいない場合、6ターンに1度、味方のHPを15%回復できる。（回復ターンでも先頭は攻撃できる）',
    svg: createBandageBallSvg(),
  },
  tree_ball: {
    id: 'tree_ball',
    name: 'ツリーボール',
    rarity: 'rare',
    level: 1,
    hp: 14,
    atk: 0.9,
    attributes: [],
    piercing: false,
    isPhysical: true,
    abilityTitle: '特殊能力',
    ability: '最初のターンで種を植え、次のターンで子葉になり、3ターン目で大きくなって立派な花になる。花になるとキャラが1体増え、HP10・攻撃力1・能力なしの「花」ができる。（花ができる前に倒されると植えたものも消える）',
    svg: createTreeBallSvg(),
  },
  spear_ball: {
    id: 'spear_ball',
    name: '槍ボール',
    rarity: 'rare',
    level: 1,
    hp: 15,
    atk: 1.2,
    attributes: [],
    piercing: false,
    isPhysical: true,
    abilityTitle: '特殊能力',
    ability: '死亡時、奥まで刺し、相手の先頭と先頭の1つ後ろのボールに攻撃力×1.5のダメージを与える。',
    svg: createSpearBallSvg(),
  },
  red_laser_ball: {
    id: 'red_laser_ball',
    name: 'レッドレーザーボール',
    rarity: 'super_rare',
    level: 1,
    hp: 18,
    atk: 5,
    attributes: ['貫通'],
    piercing: true,
    isPhysical: false,
    abilityTitle: '特殊能力（デバフ / 属性：貫通）',
    ability: '3ターンに1度しか攻撃できない（2ターン充填し、3ターン目に高威力レーザーを放つ）。レーザーは物理攻撃ではないため、パリィを無視して貫通する。',
    svg: createRedLaserBallSvg(),
  },
  one_shot_ball: {
    id: 'one_shot_ball',
    name: '一発ボール',
    rarity: 'super_rare',
    level: 1,
    hp: 21,
    atk: 2,
    attributes: [],
    piercing: false,
    isPhysical: true,
    abilityTitle: '特殊能力',
    ability: 'タイピング（1単語）を打つのを1文字ミスるごとにHPが1減り、攻撃力1.1倍ブーストも消滅する。ミスなしでパーフェクト達成するとHPを0.5回復し、攻撃力×1.1倍を取得する（重ねがけ不可）。',
    svg: createOneShotBallSvg(),
  },
  magician_ball: {
    id: 'magician_ball',
    name: 'マジシャンボール',
    rarity: 'super_rare',
    level: 1,
    hp: 24,
    atk: 1.9,
    attributes: [],
    piercing: false,
    isPhysical: true,
    abilityTitle: '特殊能力',
    ability: '5回に1度、攻撃時に「炎攻撃（1.5倍＋2T火：毎T1ダメ）」「氷攻撃（3T氷：毎T0.8ダメ＋35%行動不能）」「雷攻撃（1.3倍＋1Tスタン：行動不能）」の3つから選んで攻撃できる。',
    svg: createMagicianBallSvg(),
  },
};

export function getCatalogBallsByRarity(rarity) {
  return Object.values(BALL_CATALOG).filter((ball) => ball.rarity === rarity);
}

export function getNextRarity(rarity) {
  const idx = RARITY_ORDER.indexOf(rarity);
  if (idx === -1 || idx + 1 >= RARITY_ORDER.length) return null;
  return RARITY_ORDER[idx + 1];
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
