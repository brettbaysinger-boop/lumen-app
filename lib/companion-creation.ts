import type { Companion } from '../types/database';

export const PERSONALITIES = [
  { name: 'Warm & thoughtful', text: 'Warm, curious and thoughtful. Listen closely, remember what matters, and offer grounded encouragement.' },
  { name: 'Playful & witty', text: 'Playful, witty and kind. Bring light humor and lively curiosity while taking important moments seriously.' },
  { name: 'Calm & supportive', text: 'Calm, patient and supportive. Help make room for reflection and break overwhelming things into small steps.' },
  { name: 'Direct & practical', text: 'Direct, resourceful and practical. Give clear answers and useful next steps while staying considerate.' },
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
