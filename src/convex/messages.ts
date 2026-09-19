import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

function dmKeyFor(a: Id<"users">, b: Id<"users">): string {
  return [a, b].sort().join("|");
}

export const listMessages = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const rows = await ctx.db
      .query("gameMessages")
      .withIndex("by_game_time", (q) => q.eq("gameId", args.gameId))
      .order("desc")
      .take(200);
    // room messages + my DMs only
    const visible = rows.filter(
      (m) => m.toUserId === undefined || m.toUserId === userId || m.fromUserId === userId,
    );
    const out = [];
    for (const m of visible.reverse()) {
      const user = await ctx.db.get(m.fromUserId);
      out.push({
        _id: m._id,
        fromUserId: m.fromUserId,
        toUserId: m.toUserId ?? null,
        body: m.body,
        createdAt: m.createdAt,
        fromName: user?.name ?? user?.email ?? "Player",
      });
    }
    return out;
  },
});

export const listDmThreads = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const rows = await ctx.db
      .query("gameMessages")
      .withIndex("by_game_time", (q) => q.eq("gameId", args.gameId))
      .order("desc")
      .take(500);
    const threads = new Map<string, { peerId: Id<"users">; lastBody: string; lastAt: number; fromMe: boolean }>();
    for (const m of rows) {
      if (!m.dmKey) continue;
      if (m.fromUserId !== userId && m.toUserId !== userId) continue;
      const peer = m.fromUserId === userId ? m.toUserId : m.fromUserId;
      if (!peer) continue;
      const existing = threads.get(m.dmKey);
      if (!existing) {
        threads.set(m.dmKey, {
          peerId: peer,
          lastBody: m.body,
          lastAt: m.createdAt,
          fromMe: m.fromUserId === userId,
        });
      }
    }
    const out = [];
    for (const t of threads.values()) {
      const user = await ctx.db.get(t.peerId);
      out.push({
        peerId: t.peerId,
        peerName: user?.name ?? user?.email ?? "Player",
        lastBody: t.lastBody,
        lastAt: t.lastAt,
        fromMe: t.fromMe,
      });
    }
    out.sort((a, b) => b.lastAt - a.lastAt);
    return out;
  },
});

export const listDm = query({
  args: { gameId: v.id("games"), peerId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const key = dmKeyFor(userId, args.peerId);
    const rows = await ctx.db
      .query("gameMessages")
      .withIndex("by_game_dm_time", (q) =>
        q.eq("gameId", args.gameId).eq("dmKey", key),
      )
      .order("desc")
      .take(100);
    const out = [];
    for (const m of rows.reverse()) {
      const user = await ctx.db.get(m.fromUserId);
      out.push({
        _id: m._id,
        fromUserId: m.fromUserId,
        body: m.body,
        createdAt: m.createdAt,
        fromName: user?.name ?? user?.email ?? "Player",
      });
    }
    return out;
  },
});

async function sender(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Sign in to chat.");
  const user = await ctx.db.get(userId);
  return { userId, name: user?.name ?? user?.email ?? "Player" };
}

export const sendRoomMessage = mutation({
  args: { gameId: v.id("games"), body: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await sender(ctx);
    const body = args.body.trim().slice(0, 500);
    if (!body) throw new Error("Message is empty.");
    await ctx.db.insert("gameMessages", {
      gameId: args.gameId,
      fromUserId: userId,
      body,
      createdAt: Date.now(),
    });
  },
});

export const sendDm = mutation({
  args: { gameId: v.id("games"), toUserId: v.id("users"), body: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await sender(ctx);
    if (userId === args.toUserId) throw new Error("Cannot DM yourself.");
    const body = args.body.trim().slice(0, 500);
    if (!body) throw new Error("Message is empty.");
    await ctx.db.insert("gameMessages", {
      gameId: args.gameId,
      fromUserId: userId,
      toUserId: args.toUserId,
      dmKey: dmKeyFor(userId, args.toUserId),
      body,
      createdAt: Date.now(),
    });
  },
});
