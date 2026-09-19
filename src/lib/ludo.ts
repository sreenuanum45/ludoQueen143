// Shared Ludo-variant rules + geometry for 6/8/12-player boards.
//
// Board model: one shared ring of 48 cells (48 is divisible by 6, 8 and 12,
// so every seat gets an equal arc: 8 / 6 / 4 cells). Tokens travel clockwise
// from their seat's start cell, complete a full lap, then turn into a private
// 5-cell home column pointing at the board center. Last cell = home.
//
// Token state: -1 = in base yard, 0..47 = ring progress from own start,
// 48..51 = home column, 52 = finished (home).
// Total path length per token = 52 steps (48 ring + 5 home - 1 overlap).

export const RING = 48; // shared ring size
export const HOME_COL = 5; // private home column length (incl. final home cell)
export const PATH_LEN = RING + HOME_COL; // 53 progress units, last = home
export const TOKENS_PER_PLAYER = 4;
export const START_ROLL = 6; // roll needed to bring a token out of base
export const EXTRA_ON_SIX = true; // rolling 6 grants another turn
export const EXTRA_ON_CAPTURE = true; // capturing grants another turn
export const EXTRA_ON_HOME = true; // bringing a token home grants another turn
export const SAFE_CELLS = [0, 8]; // ring-relative safe offsets per seat (start + star)

export type SeatColor = {
  name: string;
  /** oklch tailwind-friendly hex for fills */
  fill: string;
  /** darker stroke */
  stroke: string;
};

// Muted, minimalist-leaning palette (one hue per seat, low saturation).
export const SEAT_COLORS: SeatColor[] = [
  { name: "Red", fill: "#e5646c", stroke: "#b23840" },
  { name: "Amber", fill: "#e8a13c", stroke: "#b5741a" },
  { name: "Lime", fill: "#8fbf54", stroke: "#5f8f2c" },
  { name: "Teal", fill: "#4fb8a8", stroke: "#2a8a7b" },
  { name: "Blue", fill: "#5f8fd9", stroke: "#3763a8" },
  { name: "Violet", fill: "#9d7fd4", stroke: "#6f51a6" },
  { name: "Rose", fill: "#d97fa4", stroke: "#a85077" },
  { name: "Cyan", fill: "#54b3d4", stroke: "#2c7f9e" },
  { name: "Moss", fill: "#6f9f6f", stroke: "#47704a" },
  { name: "Slate", fill: "#7d8ba6", stroke: "#53617c" },
  { name: "Coral", fill: "#e08862", stroke: "#ad5c3a" },
  { name: "Plum", fill: "#b0728f", stroke: "#814a66" },
];

export type PlayerLite = {
  userId: string;
  seat: number;
  team: number;
  name: string;
};

/** Seat -> entry (start) cell index on the shared ring. */
export function startCellForSeat(seat: number, seats: number): number {
  return Math.round((seat * RING) / seats) % RING;
}

/** Ring cell index (0..47) for a token's progress value, or -1 if not on ring. */
export function ringCellForProgress(progress: number): number {
  if (progress < 0 || progress >= RING) return -1;
  return progress % RING;
}

/**
 * Absolute ring cell for a token, given its owner's seat.
 * progress 0 = own start cell.
 */
export function absoluteCellForToken(
  progress: number,
  seat: number,
  seats: number,
): number {
  if (progress < 0 || progress >= RING) return -1;
  return (startCellForSeat(seat, seats) + progress) % RING;
}

/** Cells (absolute ring indices) that are safe for this seat. */
export function safeCellsForSeat(seat: number, seats: number): Set<number> {
  const set = new Set<number>();
  for (const off of SAFE_CELLS) {
    set.add((startCellForSeat(seat, seats) + off) % RING);
  }
  return set;
}

/**
 * Is a capture allowed if `mover` lands on `target`'s cell?
 * Safe cells (own start, star offsets) block captures for everyone.
 * Teammates (same team) never capture each other.
 * Home column cells can never be captured (not on ring).
 */
export function canCapture(
  moverSeat: number,
  targetSeat: number,
  cell: number,
  seats: number,
  teamMode = false,
): boolean {
  if (moverSeat === targetSeat) return false; // own tokens stack instead
  if (teamMode && isTeammate(moverSeat, targetSeat, teamMode)) return false;
  const safe = safeCellsForSeat(moverSeat, seats);
  if (safe.has(cell)) return false;
  // star cell of the target seat also protects the target
  const targetSafe = safeCellsForSeat(targetSeat, seats);
  if (targetSafe.has(cell)) return false;
  return true;
}

export type MoveOutcome = {
  legal: boolean;
  reason?: string;
  from: number;
  to: number;
  captureSeat?: number;
  captureToken?: number;
  captures?: boolean;
  reachesHome?: boolean;
};

/** All legal moves for a player given dice roll. */
export function legalMoves(
  tokens: number[], // 4 progress values for the player
  dice: number,
  seat: number,
  seats: number,
  occupiedBy: Map<number, { seat: number; token: number }[]>, // absCell -> occupants
  teamMode = false,
): number[] {
  const moves: number[] = [];
  for (let t = 0; t < TOKENS_PER_PLAYER; t++) {
    if (
      tokenCanMove(tokens[t], dice, seat, seats, occupiedBy, teamMode).legal
    ) {
      moves.push(t);
    }
  }
  return moves;
}

/** Can a single token move with this dice? Returns legality + capture info. */
export function tokenCanMove(
  progress: number,
  dice: number,
  seat: number,
  seats: number,
  occupiedBy: Map<number, { seat: number; token: number }[]>,
  teamMode = false,
): MoveOutcome {
  if (progress === PATH_LEN - 1) {
    return { legal: false, reason: "Finished", from: progress, to: progress };
  }

  let to: number;
  if (progress < 0) {
    if (dice !== START_ROLL) {
      return {
        legal: false,
        reason: "Need a 6 to leave base",
        from: progress,
        to: -1,
      };
    }
    to = 0;
  } else {
    to = progress + dice;
    if (to > PATH_LEN - 1) {
      return {
        legal: false,
        reason: "Overshoots home",
        from: progress,
        to,
      };
    }
  }

  // entering home column: no captures there
  if (to >= RING) {
    return {
      legal: true,
      from: progress,
      to,
      reachesHome: to === PATH_LEN - 1,
    };
  }

  const absTo = absoluteCellForToken(to, seat, seats);
  const occupants = occupiedBy.get(absTo) ?? [];
  // own token already there: allowed (stack), no capture
  const enemy = occupants.find((o) => o.seat !== seat);
  if (enemy) {
    const cap = canCapture(seat, enemy.seat, absTo, seats, teamMode);
    if (!cap) {
      return {
        legal: false,
        reason: "Cell is protected",
        from: progress,
        to,
      };
    }
    return {
      legal: true,
      from: progress,
      to,
      captureSeat: enemy.seat,
      captureToken: enemy.token,
      captures: true,
    };
  }
  return { legal: true, from: progress, to };
}

/** Apply a move to a tokens array, returning new array (pure). */
export function applyMove(
  tokens: number[],
  tokenIndex: number,
  outcome: MoveOutcome,
): number[] {
  const next = [...tokens];
  next[tokenIndex] = outcome.to;
  return next;
}

/** Token finished check */
export function hasWon(tokens: number[]): boolean {
  return tokens.every((p) => p === PATH_LEN - 1);
}

export type TeamInfo = {
  teams: number; // team count
  seatsPerTeam: number[];
  teamOf: (seat: number) => number;
};

/**
 * Team assignment: adjacent seats are paired (seat 0+1, 2+3, ...).
 * Works for 6 (3 teams), 8 (4 teams), 12 (6 teams).
 */
export function buildTeams(seats: number, teamMode: boolean): TeamInfo {
  if (!teamMode) {
    return {
      teams: seats,
      seatsPerTeam: Array.from({ length: seats }, () => 1),
      teamOf: (s) => s,
    };
  }
  const teams = seats / 2;
  return {
    teams,
    seatsPerTeam: Array.from({ length: teams }, () => 2),
    teamOf: (s) => Math.floor(s / 2),
  };
}

/** Teammates can't capture each other (they can share cells). */
export function isTeammate(a: number, b: number, teamMode: boolean): boolean {
  if (!teamMode) return false;
  return Math.floor(a / 2) === Math.floor(b / 2);
}

//
// ── Geometry ──────────────────────────────────────────────────────
//

export type Cell = { x: number; y: number };
export type Geometry = {
  /** shared ring cells, clockwise */
  ring: Cell[];
  /** per-seat home column cells (5), from entry toward center */
  homeColumns: Cell[][];
  /** per-seat base yard token slots (4) */
  yards: Cell[][];
  size: number; // svg viewBox size
};

const SIZE = 720;
const CX = SIZE / 2;
const CY = SIZE / 2;

/**
 * Hexagonal/polygonal ring: seatsPerSide stations around the ring, each
 * station a row of cells along its side. For seats=6: hexagon with 8 cells
 * per side. seats=8: octagon, 6 cells/side. seats=12: dodecagon, 4/side.
 */
export function buildGeometry(seats: number): Geometry {
  const ring: Cell[] = [];
  const cellsPerSide = RING / seats;

  // Build a regular polygon with `seats` sides; walk each side placing
  // cellsPerSide cells from one vertex to the next (exclusive of next vertex).
  const R = 300; // ring radius
  const angleStep = (Math.PI * 2) / seats;

  const vertex = (i: number): Cell => ({
    x: CX + R * Math.cos(angleStep * i - Math.PI / 2),
    y: CY + R * Math.sin(angleStep * i - Math.PI / 2),
  });

  for (let s = 0; s < seats; s++) {
    const a = vertex(s);
    const b = vertex(s + 1);
    for (let c = 0; c < cellsPerSide; c++) {
      const t = c / cellsPerSide;
      ring.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      });
    }
  }

  // Home columns: from just inside the seat's start vertex toward center.
  const homeColumns: Cell[][] = [];
  const yards: Cell[][] = [];

  for (let s = 0; s < seats; s++) {
    const v = vertex(s);
    const dirX = (CX - v.x) / Math.hypot(CX - v.x, CY - v.y);
    const dirY = (CY - v.y) / Math.hypot(CX - v.x, CY - v.y);

    // home column cells: from just inside the ring vertex toward center
    const col: Cell[] = [];
    for (let c = 0; c < HOME_COL; c++) {
      const inset = 42 + c * 40;
      col.push({ x: v.x + dirX * inset, y: v.y + dirY * inset });
    }
    homeColumns.push(col);

    // base yard: 2x2 cluster just outside the ring near the seat's vertex
    const outX = -dirX;
    const outY = -dirY;
    const perpX = -dirY;
    const perpY = dirX;
    const baseDist = 58;
    const slot = 24;
    const yard: Cell[] = [];
    for (let i = 0; i < TOKENS_PER_PLAYER; i++) {
      const radial = i < 2 ? -1 : 1; // near/far from ring
      const lateral = i % 2 === 0 ? -1 : 1; // left/right along ring tangent
      yard.push({
        x: v.x + outX * (baseDist + radial * slot) + perpX * lateral * slot,
        y: v.y + outY * (baseDist + radial * slot) + perpY * lateral * slot,
      });
    }
    yards.push(yard);
  }

  return { ring, homeColumns, yards, size: SIZE };
}

/** Dice pip layouts for rendering a die face. */
export const DICE_PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [
    [0.25, 0.25],
    [0.75, 0.75],
  ],
  3: [
    [0.25, 0.25],
    [0.5, 0.5],
    [0.75, 0.75],
  ],
  4: [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
  ],
  5: [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.5, 0.5],
    [0.25, 0.75],
    [0.75, 0.75],
  ],
  6: [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.5],
    [0.75, 0.5],
    [0.25, 0.75],
    [0.75, 0.75],
  ],
};
