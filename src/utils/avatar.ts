/**
 * Maps avatar type names (from onboarding) to emoji characters
 * This ensures backwards compatibility with profiles that have type names stored
 * instead of emojis (e.g., "sun" instead of "☀️")
 */
const AVATAR_TYPE_TO_EMOJI: Record<string, string> = {
  sun: '☀️',
  moon: '🌙',
  star: '⭐',
  leaf: '🍃',
  flower: '🌸',
  tree: '🌳',
  mountain: '⛰️',
  wave: '🌊',
  butterfly: '🦋',
  bird: '🐦',
  fern: '🌿',
  cactus: '🌵',
};

/**
 * Get the emoji avatar from a profile's emoji_avatar field
 * If the value is an avatar type name (like "sun"), it converts it to an emoji
 * Otherwise, returns the value as-is (assuming it's already an emoji)
 * 
 * @param emojiAvatar - The emoji_avatar value from the profile
 * @param fallback - Fallback emoji if emojiAvatar is empty (default: "🎧")
 * @returns The emoji character to display
 */
export function getEmojiAvatar(emojiAvatar: string | null | undefined, fallback: string = "🎧"): string {
  if (!emojiAvatar) {
    return fallback;
  }
  
  // Check if it's an avatar type name and convert to emoji
  const lowercased = emojiAvatar.toLowerCase().trim();
  if (AVATAR_TYPE_TO_EMOJI[lowercased]) {
    return AVATAR_TYPE_TO_EMOJI[lowercased];
  }
  
  // Otherwise, return as-is (it's already an emoji or valid text)
  return emojiAvatar;
}

