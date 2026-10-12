// Curated emoji set for reactions + a wider library for the picker.
// Custom uploads are out-of-scope for v1.

// Quick-react bar shown on hover/long-press of a message.
export const QUICK_REACTIONS = [
  "👍", "❤️", "🔥", "🚀", "😂", "👀", "✅", "❌",
];

// Picker categories. Order matters — first category is shown on open.
export const EMOJI_CATEGORIES = [
  {
    name: "Reactions",
    emojis: [
      "👍", "👎", "❤️", "🔥", "🚀", "😂", "👀", "✅", "❌", "🎯",
      "💰", "📈", "📉", "💎", "🙏", "💯", "🤔", "😱", "👏", "🎉",
      "🔔", "⚡", "🤝", "💪", "🐂", "🐻", "🌙", "☀️", "🆕", "🟢",
      "🔴", "🤯", "🧠", "🤡", "💀", "👑", "🍿", "🥲",
    ],
  },
  {
    name: "Smileys",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "🥹", "🥲", "😊", "🙂", "🙃",
      "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛",
      "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🥸", "🤩", "🥳",
      "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖",
      "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯",
      "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔",
    ],
  },
  {
    name: "Hands",
    emojis: [
      "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞",
      "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍",
      "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝",
      "🙏",
    ],
  },
  {
    name: "Symbols",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
      "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "✨",
      "⭐", "🌟", "💫", "⚡", "💥", "💢", "💯", "♻️", "✅", "❌",
      "❗", "❓", "‼️", "⁉️", "⚠️",
    ],
  },
  {
    name: "Markets",
    emojis: [
      "📈", "📉", "📊", "💰", "💵", "💴", "💶", "💷", "💸", "🪙",
      "💎", "🏦", "🏛️", "⚖️", "📜", "🧾", "💳", "💼", "📱", "💻",
      "⏱️", "⏰", "⌛",
    ],
  },
];

const allSet = new Set();
for (const c of EMOJI_CATEGORIES) for (const e of c.emojis) allSet.add(e);

export const ALL_EMOJIS = Array.from(allSet);
