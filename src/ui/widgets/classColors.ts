/**
 * Class colours (UI_REDESIGN §3.2 / §3.8, retail RAID_CLASS_COLORS per docs/UI_WOW_CLASSIC.md §2): one table, mirrored from the `--cls-*` tokens in styles/tokens.css.
 * Used by the player frame, meter rows, party frames, nameplates and chat sender names.
 */

export const CLASS_COLORS: Record<string, string> = {
  knight: '#c69b6d',
  barbarian: '#b5562f',
  mage: '#3fc7eb',
  rogue: '#fff468',
  monk: '#00ff98',
  archer: '#aad372',
  paladin: '#f48cba',
  necromancer: '#c41e3a',
  warlock: '#8788ee',
  demonhunter: '#a330c9',
  evoker: '#33937f',
  // CLASS SCAFFOLD (must equal the --cls-* tokens in styles/tokens.css)
  priest: '#ffffff',
  shaman: '#0070dd',
  druid: '#ff7c0a',
};

const FALLBACK = '#e8c46a';

/** Class colour hex for a class id; unknown or missing ids fall back to the accent gold. */
export function classColor(id: string | undefined): string {
  return (id !== undefined && CLASS_COLORS[id]) || FALLBACK;
}

let classAssertDone = false;

/**
 * One-time dev assert: every CLASS_COLORS entry must equal the matching `--cls-*` token on :root.
 * Logs a warning on mismatch; never throws. Call once at UI boot (dev builds only).
 */
export function runClassColorAsserts(): void {
  if (classAssertDone) return;
  classAssertDone = true;
  try {
    const style = getComputedStyle(document.documentElement);
    for (const [id, hex] of Object.entries(CLASS_COLORS)) {
      const token = style.getPropertyValue(`--cls-${id}`).trim().toLowerCase();
      if (token !== hex) console.warn(`[classColors] --cls-${id} is "${token}", expected "${hex}"`);
    }
  } catch (err) {
    console.warn('[classColors] token assert skipped', err);
  }
}
