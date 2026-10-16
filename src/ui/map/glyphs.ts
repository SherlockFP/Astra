/**
 * Map icons (canvas glyphs) of the open-world map and the minimap. Each glyph is drawn centred on (x, y) in screen pixels at a
 * radius `r` (px). Pure canvas, no DOM. OWNER: hud module (map rendering).
 */
import { BOSS_COL, CAMP_COL, GATE_COL, METIN_COL, MINIBOSS_COL, RARE_COL, WAYPOINT_COL } from './mapStyle';

/** What a pin is. Quest rings and givers have their own functions (quest ring, badge). */
export type PinKind =
  | 'waypoint' | 'village' | 'entrance' | 'metin' | 'boss' | 'miniboss' | 'rare' | 'chest' | 'shrine'
  | 'vista' | 'landmark' | 'hidden' | 'gather' | 'camp' | 'farm' | 'elite' | 'patrol' | 'graveyard' | 'cursed';

/** A chevron-shaped pointer; `ang` in radians (0 = right). Used for the player and party members. */
export function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, col: string, r: number, outline = '#000'): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = col;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(-r * 0.75, r * 0.7);
  ctx.lineTo(-r * 0.35, 0);
  ctx.lineTo(-r * 0.75, -r * 0.7);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

export function house(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string): void {
  const k = r / 6;
  ctx.save();
  ctx.fillStyle = col;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y - 6 * k);
  ctx.lineTo(x + 6 * k, y - 1 * k);
  ctx.lineTo(x + 4 * k, y - 1 * k);
  ctx.lineTo(x + 4 * k, y + 5 * k);
  ctx.lineTo(x - 4 * k, y + 5 * k);
  ctx.lineTo(x - 4 * k, y - 1 * k);
  ctx.lineTo(x - 6 * k, y - 1 * k);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Dungeon gate: an arch with a door; grey when the player is under its level. */
export function gate(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string = GATE_COL): void {
  ctx.save();
  ctx.fillStyle = col;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.7, y + r);
  ctx.lineTo(x - r * 0.7, y - r * 0.2);
  ctx.arc(x, y - r * 0.2, r * 0.7, Math.PI, 0);
  ctx.lineTo(x + r * 0.7, y + r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function chest(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const k = r / 6;
  ctx.save();
  ctx.fillStyle = '#c8922e';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.fillRect(x - 5 * k, y - 2 * k, 10 * k, 7 * k);
  ctx.strokeRect(x - 5 * k, y - 2 * k, 10 * k, 7 * k);
  ctx.fillStyle = '#f3d27a';
  ctx.fillRect(x - 5 * k, y - 4 * k, 10 * k, 2.5 * k);
  ctx.strokeRect(x - 5 * k, y - 4 * k, 10 * k, 2.5 * k);
  ctx.restore();
}

export function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const k = r / 6;
  ctx.save();
  ctx.fillStyle = '#d8e8ff';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, y, 6 * k, 3.5 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1a2a3a';
  ctx.beginPath();
  ctx.arc(x, y, 1.8 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Round glyph; `cross` adds a white plus (shrines, landmarks). */
export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, cross = false): void {
  ctx.save();
  ctx.fillStyle = col;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (cross) {
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(x - r * 0.55, y);
    ctx.lineTo(x + r * 0.55, y);
    ctx.moveTo(x, y - r * 0.55);
    ctx.lineTo(x, y + r * 0.55);
    ctx.stroke();
  }
  ctx.restore();
}

/** Diamond (waypoints, metin stones, exits). */
export function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string): void {
  ctx.save();
  ctx.fillStyle = col;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Skull (boss, mini-boss lair, elite camp). */
export function skull(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string): void {
  ctx.save();
  ctx.fillStyle = col;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y - 1, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1a0a08';
  ctx.fillRect(x - r * 0.5, y - r * 0.4, r * 0.35, r * 0.4);
  ctx.fillRect(x + r * 0.15, y - r * 0.4, r * 0.35, r * 0.4);
  ctx.restore();
}

export function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string = RARE_COL): void {
  ctx.save();
  ctx.fillStyle = col;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Tent: a camp (small triangle with a flap). */
export function tent(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string): void {
  ctx.save();
  ctx.fillStyle = col;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y + r * 0.7);
  ctx.lineTo(x - r, y + r * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Farming spot: a gold coin with a ring. */
export function coin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.fillStyle = '#e8c46a';
  ctx.strokeStyle = '#2a1a04';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#fff3c0';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Tombstone: a graveyard (release point). */
export function tomb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string): void {
  ctx.save();
  ctx.fillStyle = col;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.7, y + r);
  ctx.lineTo(x - r * 0.7, y - r * 0.3);
  ctx.arc(x, y - r * 0.3, r * 0.7, Math.PI, 0);
  ctx.lineTo(x + r * 0.7, y + r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Gold quest marker: `!` available, `?` ready to turn in, grey = the next quest waits for the level. */
export function badge(ctx: CanvasRenderingContext2D, x: number, y: number, ch: string, fill = '#e8c46a', r = 7): void {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1a0a08';
  ctx.font = `900 ${Math.round(r * 1.55)}px 'Alegreya Sans', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, x, y + 0.5);
  ctx.restore();
}

/** Blue ring around a quest target (pulses with `t`, seconds). */
export function questRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, col = '#58b0ff'): void {
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r + 1.5 * Math.sin(t * 4), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Gold teardrop pin of the player's own waypoint (map click). */
export function waypointPin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.fillStyle = '#ffd24a';
  ctx.strokeStyle = '#2a1a04';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - r * 0.75, y - r * 1.5);
  ctx.arc(x, y - r * 1.5, r * 0.75, Math.PI * 1.15, Math.PI * -0.15, false);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** One glyph by pin kind. `col` overrides the default colour; `known` dims undiscovered stones; `locked` greys a gate. */
export function glyph(ctx: CanvasRenderingContext2D, kind: PinKind, x: number, y: number, r: number, opts: { col?: string; known?: boolean; locked?: boolean; num?: number } = {}): void {
  const alpha = opts.known === false ? 0.45 : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  switch (kind) {
    case 'waypoint': diamond(ctx, x, y, r, opts.col ?? WAYPOINT_COL); break;
    case 'village': house(ctx, x, y, r, opts.col ?? CAMP_COL); break;
    case 'entrance': gate(ctx, x, y, r, opts.locked ? '#8d939c' : opts.col ?? GATE_COL); break;
    case 'metin':
      diamond(ctx, x, y, r, opts.col ?? METIN_COL);
      if (opts.num !== undefined) {
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${Math.round(r * 1.3)}px 'Alegreya Sans', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(opts.num), x, y + 0.5);
      }
      break;
    case 'boss': skull(ctx, x, y, r + 1, opts.col ?? BOSS_COL); break;
    case 'miniboss': skull(ctx, x, y, r, opts.col ?? MINIBOSS_COL); break;
    case 'rare': star(ctx, x, y, r + 1, opts.col ?? RARE_COL); break;
    case 'chest': chest(ctx, x, y, r + 1); break;
    case 'shrine': dot(ctx, x, y, r, opts.col ?? '#e8c46a', true); break;
    case 'vista': eye(ctx, x, y, r + 1); break;
    case 'landmark': dot(ctx, x, y, r * 0.8, opts.col ?? '#e8d6a0', true); break;
    case 'hidden': dot(ctx, x, y, r * 0.8, opts.col ?? '#e8d6a0'); break;
    case 'gather': dot(ctx, x, y, r * 0.7, opts.col ?? '#7fd38f'); break;
    case 'camp': tent(ctx, x, y, r * 0.8, opts.col ?? CAMP_COL); break;
    case 'farm': coin(ctx, x, y, r * 0.75); break;
    case 'elite': skull(ctx, x, y, r * 0.75, opts.col ?? BOSS_COL); break;
    case 'patrol': dot(ctx, x, y, r * 0.45, opts.col ?? '#c8c8c8'); break;
    case 'graveyard': tomb(ctx, x, y, r * 0.85, opts.col ?? '#d8d4c8'); break;
    case 'cursed': skull(ctx, x, y, r * 0.8, '#7b2fb0'); break;
  }
  ctx.restore();
}
