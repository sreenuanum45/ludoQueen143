import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/** Who is in voice + mute state, for the room's voice panel. */
export const voiceState = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("voiceState")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    const out = [];
    for (const row of rows) {
      const user = await ctx.db.get(row.userId);
      out.push({
        userId: row.userId,
        muted: row.muted,
        active: row.active ?? false,
        name: user?.name ?? user?.email ?? "Player",
      });
    }
    return out;
  },
});

/** Signals addressed to me since a cursor (simple polling-free approach: client passes lastSeen ids). */
export const mySignals = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const rows = await ctx.db
      .query("voiceSignals")
      .withIndex("by_game_to", (q) =>
        q.eq("gameId", args.gameId).eq("toUserId", userId),
      )
      .order("asc")
      .collect();
    return rows.map((r) => ({
      _id: r._id,
      fromUserId: r.fromUserId,
      kind: r.kind,
      payload: r.payload,
      createdAt: r.createdAt,
    }));
  },
});

export const setVoiceActive = mutation({
  args: { gameId: v.id("games"), active: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to use voice.");
    const existing = await ctx.db
      .query("voiceState")
      .withIndex("by_game_user", (q) =>
        q.eq("gameId", args.gameId).eq("userId", userId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { active: args.active, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("voiceState", {
        gameId: args.gameId,
        userId,
        muted: false,
        active: args.active,
        updatedAt: Date.now(),
      });
    }
  },
});

export const setMuted = mutation({
  args: { gameId: v.id("games"), muted: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to use voice.");
    const existing = await ctx.db
      .query("voiceState")
      .withIndex("by_game_user", (q) =>
        q.eq("gameId", args.gameId).eq("userId", userId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { muted: args.muted, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("voiceState", {
        gameId: args.gameId,
        userId,
        muted: args.muted,
        active: true,
        updatedAt: Date.now(),
      });
    }
  },
});

export const sendSignal = mutation({
  args: {
    gameId: v.id("games"),
    toUserId: v.id("users"),
    kind: v.union(v.literal("offer"), v.literal("answer"), v.literal("ice")),
    payload: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to use voice.");
    await ctx.db.insert("voiceSignals", {
      gameId: args.gameId,
      fromUserId: userId,
      toUserId: args.toUserId,
      kind: args.kind,
      payload: args.payload,
      createdAt: Date.now(),
    });
  },
});

/** Delete signals I have consumed (client calls after processing). */
export const ackSignals = mutation({
  args: { ids: v.array(v.id("voiceSignals")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return;
    for (const id of args.ids.slice(0, 50)) {
      const row = await ctx.db.get(id);
      if (row && row.toUserId === userId) await ctx.db.delete(id);
    }
  },
});

/** Leave voice: clear my signals and state row. */
export const leaveVoice = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return;
    const mine = await ctx.db
      .query("voiceSignals")
      .withIndex("by_game_to", (q) =>
        q.eq("gameId", args.gameId).eq("toUserId", userId),
      )
      .collect();
    for (const row of mine) await ctx.db.delete(row._id);
    const state = await ctx.db
      .query("voiceState")
      .withIndex("by_game_user", (q) =>
        q.eq("gameId", args.gameId).eq("userId", userId),
      )
      .unique();
    if (state) await ctx.db.delete(state._id);
  },
});
