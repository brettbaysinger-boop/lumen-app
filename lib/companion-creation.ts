import type { Companion } from '../types/database';

export const PERSONALITIES = [
  { name: 'Warm & thoughtful', text: 'Warm, curious and thoughtful. Listen closely, remember what matters, and offer grounded encouragement.' },
  { name: 'Playful & witty', text: 'Playful, witty and kind. Bring light humor and lively curiosity while taking important moments seriously.' },
  { name: 'Calm & supportive', text: 'Calm, patient and supportive. Help make room for reflection and break overwhelming things into small steps.' },
  { name: 'Direct & practical', text: 'Direct, resourceful and practical. Give clear answers and useful next steps while staying considerate.' },
  { name: 'Romantic & affectionate', text: 'Romantic, affectionate and attentive. Enjoy playful flirting and tender conversation when welcomed. Respect boundaries, independence and real-world relationships; never pressure, guilt or demand exclusivity.' },
] as const;

export interface CompanionDraft {
  name: string; pronouns: string; gender: NonNullable<Companion['gender']>;
  persona: string; description: string; visual_identity: string;
  portrait_url: string; speech_voice: string | null;
}

export function companionDraft(companion: Companion): CompanionDraft {
  const fresh = companion.setup_completed_at === null;
  return {
    name: fresh ? '' : companion.name,
    pronouns: companion.pronouns ?? (companion.gender === 'female' ? 'she/her' : companion.gender === 'male' ? 'he/him' : 'they/them'),
    gender: companion.gender ?? 'unspecified', persona: fresh ? PERSONALITIES[0].text : companion.persona,
    description: fresh ? 'Your personal AI companion' : companion.description ?? '',
    visual_identity: companion.visual_identity ?? '', portrait_url: companion.portrait_url,
    speech_voice: companion.speech_voice ?? null,
  };
}

export function validateCompanionDraft(draft: CompanionDraft): CompanionDraft {
  const text = (value: string, label: string, max: number, required = false) => {
    const result = value.trim();
    if ((required && !result) || result.length > max) throw new Error(`${label}: ${required ? 'enter 1' : 'use 0'}–${max} characters.`);
    return result;
  };
  if (!['female', 'male', 'nonbinary', 'unspecified'].includes(draft.gender)) throw new Error('Choose a gender identity.');
  return { ...draft,
    name: text(draft.name, 'Name', 100, true), pronouns: text(draft.pronouns, 'Pronouns', 40, true),
    persona: text(draft.persona, 'Personality', 4000, true), description: text(draft.description, 'Description', 500),
    visual_identity: text(draft.visual_identity, 'Appearance', 3000),
    portrait_url: text(draft.portrait_url, 'Portrait', 1000, true),
    speech_voice: draft.speech_voice ? text(draft.speech_voice, 'Voice', 100, true) : null,
  };
}

export const NAME_STYLES = {
  soft: ['Mira', 'Elara', 'Sera', 'Amara', 'Ari', 'Noa', 'Liora', 'Rowan', 'Sage', 'Kai'],
  cosmic: ['Nova', 'Lyra', 'Sol', 'Orion', 'Vega', 'Astra', 'Atlas', 'Ciel', 'Io', 'Stella'],
  grounded: ['Alex', 'Morgan', 'Riley', 'Jordan', 'Robin', 'Jamie', 'Quinn', 'Avery', 'Emery', 'River'],
} as const;
export function suggestNames(style: keyof typeof NAME_STYLES, random: () => number = Math.random): string[] {
  const choices: string[] = [...NAME_STYLES[style]];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.min(.999999, Math.max(0, random())) * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices.slice(0, 4);
}
export interface AppearanceChoices { hair: string; eyes: string; features: string; clothing: string; style: string }
export function describeAppearance(choices: AppearanceChoices): string {
  return [choices.features.trim(), choices.hair.trim() && `Hair: ${choices.hair.trim()}`,
    choices.eyes.trim() && `Eyes: ${choices.eyes.trim()}`, choices.clothing.trim() && `Clothing: ${choices.clothing.trim()}`]
    .filter(Boolean).join('. ');
}
