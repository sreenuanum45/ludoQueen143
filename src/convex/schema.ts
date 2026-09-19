import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // add other tables here

    // ===== Ludo game =====

    // A game room. Board geometry derives from players.length (6, 8, 12).
    games: defineTable({
      code: v.string(), // 5-char join code, unique
      hostId: v.id("users"),
      status: v.union(
        v.literal("lobby"), // players joining, team picking, ready-up
        v.literal("playing"),
        v.literal("finished"),
      ),
      teamMode: v.boolean(), // pair adjacent seats into teams
      maxSeats: v.number(), // 6 | 8 | 12 — seat count and board size
      turnSeat: v.optional(v.number()), // seat index whose turn it is
      dice: v.optional(v.number()), // last dice roll (1..6)
      awaitingMove: v.optional(v.boolean()), // true after a roll, until a token is moved
      turnStartedAt: v.optional(v.number()),
      winnerSeats: v.optional(v.array(v.number())), // finish order
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_code", ["code"])
      .index("by_host", ["hostId"]),

    // One seat per player token (4 tokens each). seat = index in the join order.
    gamePlayers: defineTable({
      gameId: v.id("games"),
      userId: v.id("users"),
      seat: v.number(),
      team: v.number(), // team index (adjacent seats paired when teamMode)
      tokens: v.optional(v.array(v.number())), // 4 token path steps; -1 = base, 57 = home
      isReady: v.boolean(),
      connected: v.boolean(),
      lastSeenAt: v.number(),
    })
      .index("by_game", ["gameId"])
      .index("by_game_user", ["gameId", "userId"])
      .index("by_user", ["userId"]), // "my recent rooms" on the dashboard

    // Room chat + direct messages (DMs scoped by a sorted userId pair key).
    gameMessages: defineTable({
      gameId: v.id("games"),
      fromUserId: v.id("users"),
      toUserId: v.optional(v.id("users")), // absent = room-wide message
      dmKey: v.optional(v.string()), // "id1|id2" sorted pair, for DM threads
      body: v.string(),
      createdAt: v.number(),
    })
      .index("by_game_time", ["gameId", "createdAt"])
      .index("by_game_dm_time", ["gameId", "dmKey", "createdAt"]),

    // WebRTC signaling for voice: one offer/answer or trickle ICE per row.
    voiceSignals: defineTable({
      gameId: v.id("games"),
      fromUserId: v.id("users"),
      toUserId: v.id("users"),
      kind: v.union(v.literal("offer"), v.literal("answer"), v.literal("ice")),
      payload: v.string(), // JSON-serialized SDP or ICE candidate
      createdAt: v.number(),
    }).index("by_game_to", ["gameId", "toUserId"]),

    // Voice state per user per room (peers discover who is in voice + mute state).
    voiceState: defineTable({
      gameId: v.id("games"),
      userId: v.id("users"),
      muted: v.boolean(),
      active: v.optional(v.boolean()), // true = currently in the voice call
      updatedAt: v.number(),
    })
      .index("by_game", ["gameId"])
      .index("by_game_user", ["gameId", "userId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
