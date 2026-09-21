/**
 * "The Score" — creative configuration for the HOOD Summit 2027 activation.
 *
 * This file is the single source of truth for the four trading styles and their
 * recipe modifiers. Everything the kiosk shows and everything sent to the music
 * API is derived from here, so creative changes never require touching UI code.
 */

export type PresetId = "moonshot" | "compounder" | "hustler" | "legacy";

export interface Modifier {
  id: string;
  label: string;
  blurb: string;
  /** Appended to the style prompt sent to the model. */
  style?: string;
  /** Appended to the lyric direction sent to the model. */
  lyric?: string;
}

export interface Preset {
  id: PresetId;
  label: string;
  tagline: string;
  audience: string;
  /** Base musical style prompt. */
  style: string;
  /** Base lyrical theme. */
  theme: string;
  sampleTitle: string;
  negativeTags: string;
  /** Tailwind-friendly accent hue used for this preset's card + waveform. */
  accent: string;
  vibes: Modifier[];
  angles: Modifier[];
  /** Goal chips offered at the personalization step. */
  goals: string[];
}

export const PRESETS: Preset[] = [
  {
    id: "moonshot",
    label: "Moonshot",
    tagline: "High risk. High reward. No brakes.",
    audience: "Crypto & tech traders",
    style:
      "High-energy 1980s synthwave, driving cyberpunk bassline, neon retro-futuristic synths, 125 BPM, electric pacing, triumphal build-up",
    theme:
      "An anthem about breaking limits, staying up watching the candles move green, pushing through the noise of the market, and riding the wave to the upper atmosphere",
    sampleTitle: "Green Candle Horizons",
    negativeTags: "country, acoustic ballad, lo-fi, slow tempo",
    accent: "165 100% 50%",
    vibes: [
      {
        id: "cybernetic",
        label: "Cybernetic",
        blurb: "Robotic vocoders, digitized sci-fi edge",
        style: "robotic vocoder lead vocals, darker digitized sci-fi tone, talkbox harmonies",
      },
      {
        id: "neon-hype",
        label: "Neon Hype",
        blurb: "Soaring electric guitar climax",
        style: "soaring melodic electric guitar solo climax, stadium-sized lead lines",
      },
    ],
    angles: [
      {
        id: "cosmos",
        label: "The Cosmos",
        blurb: "Moons, rockets, zero gravity",
        lyric: "moons, rockets, starlight, zero gravity, escape velocity",
      },
      {
        id: "midnight",
        label: "The Midnight Trade",
        blurb: "Late-night, high-stakes adrenaline",
        lyric: "glowing screens at 2am, sleepless conviction, the adrenaline of a market that never sleeps",
      },
    ],
    goals: [
      "Catch the next cycle early",
      "Turn conviction into freedom",
      "Outwork the noise",
      "Prove the doubters wrong",
    ],
  },
  {
    id: "compounder",
    label: "Compounder",
    tagline: "Patience is the whole strategy.",
    audience: "Long-term ETF investors",
    style:
      "Chill melodic deep house, smooth liquid drum and bass chords, rhythmic acoustic guitar accents, relaxing late-night rooftop lounge vibe",
    theme:
      "A song about patience, building a foundation brick by brick, letting time do the heavy lifting, and finding perfect harmony in steady growth over decades",
    sampleTitle: "The Compounding Heart",
    negativeTags: "heavy metal, aggressive trap, harsh distortion, screaming",
    accent: "122 100% 45%",
    vibes: [
      {
        id: "lofi-dream",
        label: "Lofi Dream",
        blurb: "Vinyl crackle, jazzy saxophone",
        style: "vinyl crackle texture, slower tempo, smooth jazzy saxophone lines",
      },
      {
        id: "sunset-chill",
        label: "Sunset Chill",
        blurb: "Tropical percussion, breezy pads",
        style: "upbeat tropical percussion rhythm, breezy warm synthesizer pads",
      },
    ],
    angles: [
      {
        id: "long-game",
        label: "The Long Game",
        blurb: "Time, patience, steady growth",
        lyric: "seasons turning, patience, steady growth measured in years",
      },
      {
        id: "flow",
        label: "The Flow",
        blurb: "Rivers, valleys, rising tides",
        lyric: "rivers carving valleys, tides rising, roots going deep",
      },
    ],
    goals: [
      "Retire on my own terms",
      "Build quiet, boring wealth",
      "Buy back my time",
      "Stay the course",
    ],
  },
  {
    id: "hustler",
    label: "Hustler",
    tagline: "Be your own broker.",
    audience: "Options & day traders",
    style:
      "Hype modern trap beat, heavy distorted 808 bass, crisp hi-hat rolls, futuristic ethereal synth melody, dark but motivational hip-hop style",
    theme:
      "Rhymes about taking control of your own destiny, being your own broker, reading the tape, and turning a small fractional start into an empire",
    sampleTitle: "Bull Market State of Mind",
    negativeTags: "orchestral ballad, folk, polka, elevator music",
    accent: "270 100% 65%",
    vibes: [
      {
        id: "underground",
        label: "Late Night Underground",
        blurb: "Moody, ambient mixtape aesthetic",
        style: "moody ambient underground mixtape aesthetic, dusty low-end, sparse arrangement",
      },
      {
        id: "festival",
        label: "Festival Anthem",
        blurb: "Massive EDM drop before the chorus",
        style: "massive electronic EDM drop before the chorus, festival-scale energy",
      },
    ],
    angles: [
      {
        id: "maverick",
        label: "The Maverick",
        blurb: "Independence, calling your own shots",
        lyric: "independence, breaking the mold, calling your own shots, needing nobody's permission",
      },
      {
        id: "horizon",
        label: "The Horizon",
        blurb: "Skylines, travel, freedom",
        lyric: "skylines, open roads, travel, freedom that was earned",
      },
    ],
    goals: [
      "Run my own book",
      "Build an empire from fractions",
      "Never ask permission again",
      "Read the tape better than anyone",
    ],
  },
  {
    id: "legacy",
    label: "Legacy",
    tagline: "For the ones who come next.",
    audience: "Dividends & wealth preservation",
    style:
      "Cinematic indie pop, swelling orchestral strings, uplifting piano chords, powerful stomps and claps chorus, inspiring stadium sound",
    theme:
      "An emotional, epic song about freedom, leaving a legacy, turning hard work into a secure future for the ones you love, and writing your own final chapter",
    sampleTitle: "Generational Wealth",
    negativeTags: "harsh distortion, aggressive screaming, chiptune",
    accent: "43 96% 58%",
    vibes: [
      {
        id: "acoustic",
        label: "Acoustic Intimate",
        blurb: "Raw piano and vocal",
        style: "stripped-back production, raw intimate piano and vocal performance, close-mic warmth",
      },
      {
        id: "stadium",
        label: "Epic Stadium",
        blurb: "Booming drums, backing choir",
        style: "booming cinematic drums, massive backing choir, stadium-sized reverb",
      },
    ],
    angles: [
      {
        id: "foundation",
        label: "The Foundation",
        blurb: "Home, roots, family security",
        lyric: "building a home, putting down roots, keeping the people you love safe",
      },
      {
        id: "next-chapter",
        label: "The Next Chapter",
        blurb: "Early retirement, freedom of time",
        lyric: "time that finally belongs to you, an early exit, the start of a new chapter",
      },
    ],
    goals: [
      "Take care of my family",
      "Buy the house",
      "Leave something behind",
      "Retire early, live fully",
    ],
  },
];

export const PRESET_MAP: Record<PresetId, Preset> = Object.fromEntries(
  PRESETS.map((p) => [p.id, p]),
) as Record<PresetId, Preset>;

export interface Recipe {
  preset: PresetId;
  vibe: string;
  angle: string;
  firstName?: string;
  goal?: string;
  spin?: string;
}

export interface ComposedPrompt {
  title: string;
  style: string;
  prompt: string;
  negativeTags: string;
}

/** Title-cases a name and strips anything that isn't a letter, space, or hyphen. */
export function cleanName(raw?: string): string {
  if (!raw) return "";
  return raw
    // Letters (including common accented and Cyrillic ranges), spaces, apostrophes, hyphens.
    .replace(/[^A-Za-z\u00C0-\u024F\u0400-\u04FF\s'-]/g, "")
    .trim()
    .slice(0, 24)
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Turns kiosk taps into the style + lyric direction sent to the model.
 * Kept pure and shared so the operator dashboard can show exactly what was sent.
 */
export function composePrompt(recipe: Recipe): ComposedPrompt {
  const preset = PRESET_MAP[recipe.preset];
  const vibe = preset.vibes.find((v) => v.id === recipe.vibe) ?? preset.vibes[0];
  const angle = preset.angles.find((a) => a.id === recipe.angle) ?? preset.angles[0];
  const name = cleanName(recipe.firstName);

  const style = [preset.style, vibe.style].filter(Boolean).join(", ");

  // The provider runs in non-custom mode, where this text is the song's *core
  // idea* and it writes the lyrics itself. It must therefore read like a
  // description of a song, never like instructions to a model.
  //
  // This is not a style preference. In custom mode the same field is used
  // verbatim as the lyric sheet, which is exactly how a track once shipped
  // singing "a big repeatable hook" and "use their name in the chorus" to a
  // guest. Keep this prose.
  const idea: string[] = [preset.theme];

  if (angle.lyric) idea.push(`Imagery: ${angle.lyric}`);
  if (name) idea.push(`Written for ${name}, and their name belongs in the chorus`);
  if (recipe.goal) idea.push(`What they are working toward: ${recipe.goal}`);
  if (recipe.spin) idea.push(`A detail that is theirs alone: ${recipe.spin}`);

  const title = name ? `${name}'s Score` : `The Score — ${preset.label}`;

  return {
    title: title.slice(0, 80),
    style: style.slice(0, 1000),
    prompt: idea.filter(Boolean).join(". ").slice(0, 3000),
    negativeTags: preset.negativeTags,
  };
}
