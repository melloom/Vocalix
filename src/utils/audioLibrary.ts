/**
 * Audio library for background music and sound effects
 * Provides royalty-free music tracks and sound effects
 */

export interface AudioLibraryItem {
  id: string;
  name: string;
  category: string;
  url: string;
  duration?: number; // Duration in seconds (if known)
  tags?: string[];
}

export interface BackgroundMusicItem extends AudioLibraryItem {
  type: "music";
  mood?: string; // e.g., "upbeat", "calm", "energetic"
  bpm?: number; // Beats per minute
}

export interface SoundEffectItem extends AudioLibraryItem {
  type: "effect";
  effectType?: string; // e.g., "notification", "transition", "ambient"
}

/**
 * Background music library
 * These are placeholder URLs - in production, you would host royalty-free music
 * or use a service like Freesound, Pixabay, or similar
 */
export const BACKGROUND_MUSIC_LIBRARY: BackgroundMusicItem[] = [
  {
    id: "bgm-001",
    name: "Upbeat Ambient",
    category: "Ambient",
    type: "music",
    mood: "upbeat",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", // Placeholder
    tags: ["ambient", "upbeat", "background"],
  },
  {
    id: "bgm-002",
    name: "Calm Piano",
    category: "Piano",
    type: "music",
    mood: "calm",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", // Placeholder
    tags: ["piano", "calm", "relaxing"],
  },
  {
    id: "bgm-003",
    name: "Energetic Beat",
    category: "Electronic",
    type: "music",
    mood: "energetic",
    bpm: 120,
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", // Placeholder
    tags: ["electronic", "energetic", "beat"],
  },
  {
    id: "bgm-004",
    name: "Acoustic Guitar",
    category: "Acoustic",
    type: "music",
    mood: "warm",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3", // Placeholder
    tags: ["acoustic", "guitar", "warm"],
  },
  {
    id: "bgm-005",
    name: "Synth Wave",
    category: "Electronic",
    type: "music",
    mood: "retro",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3", // Placeholder
    tags: ["synth", "retro", "wave"],
  },
];

/**
 * Sound effects library
 * These are placeholder URLs - in production, you would host royalty-free sound effects
 */
export const SOUND_EFFECTS_LIBRARY: SoundEffectItem[] = [
  {
    id: "sfx-001",
    name: "Notification Ding",
    category: "UI",
    type: "effect",
    effectType: "notification",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", // Placeholder
    tags: ["notification", "ding", "alert"],
  },
  {
    id: "sfx-002",
    name: "Whoosh Transition",
    category: "Transitions",
    type: "effect",
    effectType: "transition",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", // Placeholder
    tags: ["transition", "whoosh", "swoosh"],
  },
  {
    id: "sfx-003",
    name: "Click",
    category: "UI",
    type: "effect",
    effectType: "notification",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", // Placeholder
    tags: ["click", "ui", "button"],
  },
  {
    id: "sfx-004",
    name: "Applause",
    category: "Crowd",
    type: "effect",
    effectType: "ambient",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3", // Placeholder
    tags: ["applause", "crowd", "celebration"],
  },
  {
    id: "sfx-005",
    name: "Laugh Track",
    category: "Crowd",
    type: "effect",
    effectType: "ambient",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3", // Placeholder
    tags: ["laugh", "crowd", "comedy"],
  },
];

/**
 * Get all background music items
 */
export function getBackgroundMusic(): BackgroundMusicItem[] {
  return BACKGROUND_MUSIC_LIBRARY;
}

/**
 * Get all sound effects
 */
export function getSoundEffects(): SoundEffectItem[] {
  return SOUND_EFFECTS_LIBRARY;
}

/**
 * Search library items by query
 */
export function searchLibrary(
  query: string,
  type?: "music" | "effect"
): (BackgroundMusicItem | SoundEffectItem)[] {
  const searchTerm = query.toLowerCase();
  const allItems = [
    ...(type === "music" || !type ? BACKGROUND_MUSIC_LIBRARY : []),
    ...(type === "effect" || !type ? SOUND_EFFECTS_LIBRARY : []),
  ];

  return allItems.filter(
    (item) =>
      item.name.toLowerCase().includes(searchTerm) ||
      item.category.toLowerCase().includes(searchTerm) ||
      item.tags?.some((tag) => tag.toLowerCase().includes(searchTerm))
  );
}

/**
 * Get library item by ID
 */
export function getLibraryItem(
  id: string
): BackgroundMusicItem | SoundEffectItem | undefined {
  return (
    BACKGROUND_MUSIC_LIBRARY.find((item) => item.id === id) ||
    SOUND_EFFECTS_LIBRARY.find((item) => item.id === id)
  );
}

/**
 * Load audio blob from library item URL
 */
export async function loadLibraryAudio(
  item: BackgroundMusicItem | SoundEffectItem
): Promise<Blob> {
  try {
    const response = await fetch(item.url);
    if (!response.ok) {
      throw new Error(`Failed to load audio: ${response.statusText}`);
    }
    return await response.blob();
  } catch (error) {
    console.error("Failed to load library audio:", error);
    throw error;
  }
}

/**
 * Get library items by category
 */
export function getLibraryItemsByCategory(
  category: string,
  type?: "music" | "effect"
): (BackgroundMusicItem | SoundEffectItem)[] {
  const allItems = [
    ...(type === "music" || !type ? BACKGROUND_MUSIC_LIBRARY : []),
    ...(type === "effect" || !type ? SOUND_EFFECTS_LIBRARY : []),
  ];

  return allItems.filter(
    (item) => item.category.toLowerCase() === category.toLowerCase()
  );
}

/**
 * Get library items by mood (for music)
 */
export function getMusicByMood(mood: string): BackgroundMusicItem[] {
  return BACKGROUND_MUSIC_LIBRARY.filter(
    (item) => item.mood?.toLowerCase() === mood.toLowerCase()
  );
}

