// Community HTTP helpers — wraps workerPost and attaches the EIP-191 token
// to every write. Reads are public (no token needed).

import { workerPost } from "@/lib/workerApi";

async function postJson(path, body) {
  const res = await workerPost(path, body || {});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export const communityApi = {
  // Auth — sign-once session (returns a JWT used as `token` on writes)
  authChallenge: (address) => postJson("/community/auth/challenge", { address }),
  authLogin: ({ address, message, signature }) =>
    postJson("/community/auth/login", { address, message, signature }),
  authRefresh: (jwt) => postJson("/community/auth/refresh", { token: jwt }),

  // Reads
  listChannels: () => postJson("/community/channels", {}),
  listMessages: ({ channelId, before, limit = 50 }) =>
    postJson("/community/messages", { channel_id: channelId, before, limit }),
  getProfile: (address) => postJson("/community/profile", { address }),
  getProfileStats: (address) => postJson("/community/profile/stats", { address }),
  getProfilesBatch: (addresses) => postJson("/community/profiles/batch", { addresses }),
  getStats: () => postJson("/community/stats", {}),

  // Writes (require token { address, nonce, exp, signature })
  postMessage: (token, { channelId, content, replyTo }) =>
    postJson("/community/post", { ...token, channel_id: channelId, content, reply_to: replyTo || null }),
  markRead: (token, channelId) =>
    postJson("/community/read", { ...token, channel_id: channelId }),
  updateProfile: (token, { handle, isPrivate }) =>
    postJson("/community/profile/update", {
      ...token,
      ...(handle !== undefined ? { handle } : {}),
      ...(isPrivate !== undefined ? { is_private: isPrivate } : {}),
    }),
  acceptTerms: (token, version = 1) =>
    postJson("/community/accept-terms", { ...token, version }),
  react: (token, { messageId, emoji }) =>
    postJson("/community/react", { ...token, message_id: messageId, emoji }),
  searchHandles: (prefix) => postJson("/community/handles", { prefix }),
  shareTrade: (token, { tradeId, comment }) =>
    postJson("/community/share-trade", { ...token, trade_id: tradeId, comment }),

  // Moderation
  flag: (token, { messageId, reason }) =>
    postJson("/community/flag", { ...token, message_id: messageId, reason }),
  deleteMessage: (token, messageId) =>
    postJson("/community/delete", { ...token, message_id: messageId }),
  pin: (token, { messageId, pinned }) =>
    postJson("/community/pin", { ...token, message_id: messageId, pinned }),
  listPinned: (channelId) =>
    postJson("/community/pinned", { channel_id: channelId }),
  mute: (token, { wallet, channelId, durationSeconds, reason }) =>
    postJson("/community/mute", { ...token, wallet, channel_id: channelId, duration_seconds: durationSeconds, reason }),
  ban: (token, { wallet, until }) =>
    postJson("/community/ban", { ...token, wallet, until }),
  modQueue: (token) =>
    postJson("/community/mod/queue", { ...token }),
  resolveFlag: (token, { flagId, action }) =>
    postJson("/community/mod/resolve-flag", { ...token, flag_id: flagId, action }),
  listModerators: () => postJson("/community/moderators", {}),
  addModerator: (token, wallet) =>
    postJson("/community/moderators/add", { ...token, wallet }),
  removeModerator: (token, wallet) =>
    postJson("/community/moderators/remove", { ...token, wallet }),
  postSystemMessage: (token, { channelId, kind, content, payload }) =>
    postJson("/community/mod/system", { ...token, channel_id: channelId, kind, content, payload }),
};

export const notificationsApi = {
  list: (token) => postJson("/notifications/list", { ...token }),
  markRead: (token, id) => postJson("/notifications/mark-read", { ...token, id }),
  markAllRead: (token) => postJson("/notifications/mark-all-read", { ...token }),
};

export const xbotApi = {
  list: (token, { status, limit } = {}) =>
    postJson("/xbot/list", { ...token, status, limit }),
  // Lazy per-row image fetch — list deliberately omits image_b64 to keep the
  // response small (it OOM-killed the worker before).
  image: (token, id) => postJson("/xbot/image", { ...token, id }),
  approve: (token, id) => postJson("/xbot/approve", { ...token, id }),
  reject: (token, { id, reason }) => postJson("/xbot/reject", { ...token, id, reason }),
};
