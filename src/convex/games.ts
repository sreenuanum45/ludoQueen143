import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  internalMutation,
  mutation,
  MutationCtx,
  query,
  QueryCtx,
} from "./_generated/server";
import {
  EXTRA_ON_SIX,
  PATH_LEN,
  RING,
  SEAT_COLORS,
  START_ROLL,
  TOKENS_PER_PLAYER as T,
  absoluteCellForToken,
  applyMove,
  buildTeams,
  hasWon,
  legalMoves,
  tokenCanMove,
} from "../lib/ludo";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";

const SEAT_SORTER = (a: Doc<"gamePlayers">, b: Doc<"gamePlayers">) =>
  a.seat - b.seat;

function code(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

async function requireUser(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Sign in to play.");
  return userId;
}

export const myMembership = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const rows = await ctx.db
      .query("gamePlayers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const row of rows) {
      const game = await ctx.db.get(row.gameId);
      if (game && game.status !== "finished") {
        return {
          gameCode: game.code,
          status: game.status,
          seat: row.seat,
        };
     }
    }
    return null;
  },
});

export const myRecentRooms = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const rows = await ctx.db
      .query("gamePlayers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const out: {
      code: string;
      status: string;
      seats: number;
      teamMode: boolean;
      joinedAt: number;
      memberCount: number;
    }[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const game = await ctx.db.get(row.gameId);
      if (!game || seen.has(game.code)) continue;
      seen.add(game.code);
      const members = await ctx.db
        .query("gamePlayers")
        .withIndex("by_game", (q) => q.eq("gameId", game._id))
        .collect();
      out.push({
        code: game.code,
        status: game.status,
        seats: game.maxSeats,
        teamMode: game.teamMode,
        joinedAt: row.lastSeenAt,
        memberCount: members.length,
      });
    }
    out.sort((a, b) => b.joinedAt - a.joinedAt);
    return out.slice(0, 6);
  },
});

export const createGame = mutation({
  args: {
    seats: v.union(v.literal(6), v.literal(8), v.literal(12)),
    teamMode: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);

    // One active room per user (finish/leave the current one first).
    const mine = await ctx.db
      .query("gamePlayers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const m of mine) {
      const g = await ctx.db.get(m.gameId);
      if (g && g.status !== "finished") {
        throw new Error("You already have an active room. Leave it first.");
      }
    }

    let gameCode = code();
    for (let attempt = 0; attempt < 5; attempt++) {
      const clash = await ctx.db
        .query("games")
        .withIndex("by_code", (q) => q.eq("code", gameCode))
        .unique();
      if (!clash) break;
      gameCode = code();
    }

    const now = Date.now();
    const gameId = await ctx.db.insert("games", {
      code: gameCode,
      hostId: userId,
      status: "lobby",
      teamMode: args.teamMode,
      maxSeats: args.seats,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("gamePlayers", {
      gameId,
      userId,
      seat: 0,
      team: 0,
      tokens: Array(T).fill(-1),
      isReady: false,
      connected: true,
      lastSeenAt: now,
    });
    return { gameCode, gameId };
  },
});

export const joinGame = mutation({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const clean = args.code.trim().toUpperCase();
    const game = await ctx.db
      .query("games")
      .withIndex("by_code", (q) => q.eq("code", clean))
      .unique();
    if (!game) throw new Error("Room not found. Check the code.");
    if (game.status === "finished") throw new Error("That room has ended.");

    const existing = await ctx.db
      .query("gamePlayers")
      .withIndex("by_game_user", (q) =>
        q.eq("gameId", game._id).eq("userId", userId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { connected: true, lastSeenAt: Date.now() });
      return { gameCode: game.code, gameId: game._id, seat: existing.seat };
    }

    if (game.status !== "lobby") {
      throw new Error("Game already started.");
    }
    const members = await ctx.db
      .query("gamePlayers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    if (members.length >= game.maxSeats) {
      throw new Error("Room is full.");
    }
    const used = new Set(members.map((m) => m.seat));
    let seat = 0;
    while (used.has(seat)) seat++;
    const teams = buildTeams(game.maxSeats, game.teamMode);
    await ctx.db.insert("gamePlayers", {
      gameId: game._id,
      userId,
      seat,
      team: teams.teamOf(seat),
      tokens: Array(T).fill(-1),
      isReady: false,
      connected: true,
      lastSeenAt: Date.now(),
    });
    return { gameCode: game.code, gameId: game._id, seat };
  },
});

export const setReady = mutation({
  args: { ready: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const { game, me } = await mySeat(ctx, userId);
    await ctx.db.patch(me._id, { isReady: args.ready });
    await ctx.db.patch(game._id, { updatedAt: Date.now() });
  },
});

export const setTeamMode = mutation({
  args: { teamMode: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const { game, members } = await roomState(ctx, userId);
    if (game.hostId !== userId) throw new Error("Only the host can change this.");
    if (game.status !== "lobby") throw new Error("Too late — game running.");
    await ctx.db.patch(game._id, { teamMode: args.teamMode, updatedAt: Date.now() });
    for (const m of members) {
      await ctx.db.patch(m._id, { team: buildTeams(game.maxSeats, args.teamMode).teamOf(m.seat) });
    }
  },
});

export const startGame = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const { game, members } = await roomState(ctx, userId);
    if (game.hostId !== userId) throw new Error("Only the host can start.");
    if (game.status !== "lobby") throw new Error("Game already running.");
    if (members.length < 2) throw new Error("Need at least 2 players.");
    const notReady = members.filter((m) => !m.isReady);
    if (notReady.length > 0) {
      throw new Error("Everyone must ready up first.");
    }
    await ctx.db.patch(game._id, {
      status: "playing",
      turnSeat: 0,
      awaitingMove: false,
      turnStartedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const rollDice = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const { game, me, members } = await roomState(ctx, userId);
    if (game.status !== "playing") throw new Error("Game not running.");
    if (game.turnSeat !== me.seat) throw new Error("Not your turn.");
    if (game.awaitingMove) throw new Error("You already rolled — move a token.");

    const dice = 1 + Math.floor(Math.random() * 6);
    await ctx.db.patch(game._id, {
      dice,
      awaitingMove: true,
      turnStartedAt: Date.now(),
      updatedAt: Date.now(),
    });
    void members;
  },
});

export const moveToken = mutation({
  args: { tokenIndex: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const { game, me, members } = await roomState(ctx, userId);
    if (game.status !== "playing") throw new Error("Game not running.");
    if (game.turnSeat !== me.seat) throw new Error("Not your turn.");
    if (!game.awaitingMove || game.dice === undefined) {
      throw new Error("Roll the dice first.");
    }
    if (args.tokenIndex < 0 || args.tokenIndex >= T) {
      throw new Error("Bad token.");
    }
    const tokens = me.tokens ?? Array(T).fill(-1);
    const occupiedBy = occupancyMap(members);

    const outcome = tokenCanMove(
      tokens[args.tokenIndex],
      game.dice,
      me.seat,
      members.length,
      occupiedBy,
      game.teamMode,
    );
    if (!outcome.legal) {
      throw new Error(outcome.reason ?? "Illegal move.");
    }

    let nextTokens = applyMove(tokens, args.tokenIndex, outcome);
    let extra = false;
    if (outcome.captures && outcome.captureSeat !== undefined && outcome.captureToken !== undefined) {
      const victim = members.find((m) => m.seat === outcome.captureSeat);
      if (victim) {
        const vt = [...(victim.tokens ?? Array(T).fill(-1))];
        vt[outcome.captureToken] = -1;
        await ctx.db.patch(victim._id, { tokens: vt });
      }
      extra = true;
    }
    if (outcome.reachesHome) extra = true;
    if (hasWon(nextTokens)) {
      // seat finished all tokens
      const winners = [...(game.winnerSeats ?? []), me.seat];
      await ctx.db.patch(game._id, { winnerSeats: winners });
      extra = true;
      const activeSeats = members.filter(
        (m) => !(game.winnerSeats ?? []).includes(m.seat) && m.seat !== me.seat,
      );
      if (activeSeats.length <= (game.teamMode ? 1 : 0)) {
        await ctx.db.patch(game._id, { status: "finished", awaitingMove: false, updatedAt: Date.now() });
        return { finished: true };
      }
    }

    // Determine next turn: extra roll on a 6, capture or home.
    const extraTurn = (game.dice === 6 && EXTRA_ON_SIX) || extra;
    await ctx.db.patch(me._id, { tokens: nextTokens });
    advanceTurn(ctx, game, me, members, extraTurn);
  },
});

export const passTurn = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const { game, me, members } = await roomState(ctx, userId);
    if (game.status !== "playing") throw new Error("Game not running.");
    if (game.turnSeat !== me.seat) throw new Error("Not your turn.");
    const dice = game.dice;
    if (game.awaitingMove && dice !== undefined) {
      // Only allow skipping when the roll actually has no legal move.
      const occupiedBy = occupancyMap(members);
      const tokens = me.tokens ?? Array(T).fill(-1);
      if (
        legalMoves(tokens, dice, me.seat, members.length, occupiedBy, game.teamMode)
          .length > 0
      ) {
        throw new Error("You still have a legal move.");
      }
    }
    advanceTurn(ctx, game, me, members, false);
  },
});

export const leaveRoom = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("gamePlayers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const row of rows) {
      const game = await ctx.db.get(row.gameId);
      if (!game || game.status === "finished") continue;
      if (game.hostId === userId) {
        // host leaves => end room
        await ctx.db.patch(game._id, { status: "finished", updatedAt: Date.now() });
      } else {
        await ctx.db.delete(row._id);
      }
    }
  },
});

export const heartbeat = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return;
    const rows = await ctx.db
      .query("gamePlayers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const now = Date.now();
    for (const row of rows) {
      const game = await ctx.db.get(row.gameId);
      if (game && game.status !== "finished") {
        await ctx.db.patch(row._id, { lastSeenAt: now, connected: true });
      }
    }
  },
});

export const gameView = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const game = await ctx.db
      .query("games")
      .withIndex("by_code", (q) => q.eq("code", args.code.trim().toUpperCase()))
      .unique();
    if (!game) return null;
    const rows = await ctx.db
      .query("gamePlayers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    rows.sort(SEAT_SORTER);
    const players = [];
    for (const row of rows) {
      const user = await ctx.db.get(row.userId);
      players.push({
        userId: row.userId,
        seat: row.seat,
        team: row.team,
        isReady: row.isReady,
        connected: row.connected,
        tokens: row.tokens ?? Array(T).fill(-1),
        name: user?.name ?? user?.email ?? "Player",
        isHost: game.hostId === row.userId,
      });
    }
    const teams = buildTeams(game.maxSeats, game.teamMode);
    return {
      code: game.code,
      status: game.status,
      maxSeats: game.maxSeats,
      teamMode: game.teamMode,
      turnSeat: game.turnSeat ?? null,
      dice: game.dice ?? null,
      awaitingMove: game.awaitingMove ?? false,
      winnerSeats: game.winnerSeats ?? [],
      players,
      teams: teams.teams,
      teamOf: Array.from({ length: game.maxSeats }, (_, s) => teams.teamOf(s)),
      seatColors: SEAT_COLORS.slice(0, game.maxSeats),
      mySeat: players.find((p) => p.userId === userId)?.seat ?? null,
      amHost: game.hostId === userId,
    };
  },
});

export const roomState = async (ctx: QueryCtx, userId: Id<"users">) => {
  const game = await activeGameFor(ctx, userId);
  if (!game) throw new Error("You are not in a room.");
  const members = await ctx.db
    .query("gamePlayers")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  members.sort(SEAT_SORTER);
  const me = members.find((m) => m.userId === userId);
  if (!me) throw new Error("You are not in this room.");
  return { game, me, members };
};

export const mySeat = async (ctx: QueryCtx, userId: Id<"users">) => {
  const { game, me, members } = await roomState(ctx, userId);
  return { game, me, members };
};

async function activeGameFor(ctx: QueryCtx, userId: Id<"users">) {
  const rows = await ctx.db
    .query("gamePlayers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const row of rows) {
    const game = await ctx.db.get(row.gameId);
    if (game && game.status !== "finished") return game;
  }
  return null;
}

function occupancyMap(
  members: Doc<"gamePlayers">[],
): Map<number, { seat: number; token: number }[]> {
  const occupiedBy = new Map<number, { seat: number; token: number }[]>();
  for (const p of members) {
    const pts = p.tokens ?? Array(T).fill(-1);
    for (let t = 0; t < pts.length; t++) {
      if (pts[t] < 0 || pts[t] >= RING) continue;
      const cell = absoluteCellForToken(pts[t], p.seat, members.length);
      if (cell < 0) continue;
      const list = occupiedBy.get(cell) ?? [];
      list.push({ seat: p.seat, token: t });
      occupiedBy.set(cell, list);
    }
  }
  return occupiedBy;
}

/** Move turn to the next active seat (or keep it for an extra roll). */
function advanceTurn(
  ctx: MutationCtx,
  game: Doc<"games">,
  me: Doc<"gamePlayers">,
  members: Doc<"gamePlayers">[],
  extraTurn: boolean,
) {
  const winners = game.winnerSeats ?? [];
  const active = members
    .filter((m) => !winners.includes(m.seat))
    .map((m) => m.seat)
    .sort((a, b) => a - b);
  const now = Date.now();
  if (extraTurn && active.includes(me.seat)) {
    ctx.db.patch(game._id, {
      awaitingMove: false,
      dice: undefined,
      turnStartedAt: now,
      updatedAt: now,
    });
    return;
  }
  const idx = active.indexOf(me.seat);
  const nextSeat =
    active.length > 0 ? active[(idx + 1) % active.length] : me.seat;
  ctx.db.patch(game._id, {
    turnSeat: nextSeat,
    dice: undefined,
    awaitingMove: false,
    turnStartedAt: now,
    updatedAt: now,
  });
}

// ── internal cleanup for finished games ─────────────────────────────
export const finishIfAllGone = internalMutation({ // eslint-disable-line @typescript-eslint/no-unused-vars
  args: {},
  handler: async (ctx) => {
    const games = await ctx.db.query("games").collect();
    const now = Date.now();
    for (const game of games) {
      if (game.status === "finished") continue;
      const members = await ctx.db
        .query("gamePlayers")
        .withIndex("by_game", (q) => q.eq("gameId", game._id))
        .collect();
      const stale = members.every((m) => now - m.lastSeenAt > 5 * 60 * 1000);
      if (stale && members.length > 0) {
        await ctx.db.patch(game._id, { status: "finished", updatedAt: now });
      }
    }
  },
});

export const legalMovesForMe = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { moves: [] as number[] };
    const game = await activeGameFor(ctx, userId);
    if (!game || game.status !== "playing" || !game.awaitingMove || game.dice === undefined) {
      return { moves: [] as number[] };
    }
    const members = await ctx.db
      .query("gamePlayers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    const me = members.find((m) => m.userId === userId);
    if (!me || game.turnSeat !== me.seat) return { moves: [] as number[] };
    const tokens = me.tokens ?? Array(T).fill(-1);
    const occupiedBy = occupancyMap(members);
    return {
      moves: legalMoves(tokens, game.dice, me.seat, members.length, occupiedBy, game.teamMode),
    };
  },
});
