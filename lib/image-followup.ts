import type { Message } from '@/types/database';

const CONFIRMATION =
  /^(?:yes|yeah|yep|sure|absolutely|definitely|go ahead|please do|do it|sounds good)(?:[\s,!.-]+(?:please|do|it|go ahead|thanks|thank you))*[\s!?.]*$/i;

const IMAGE_OFFER =
  /\b(?:generate|create|make|draw|paint|render|illustrate)\b[^.!?]{0,110}\b(?:image|picture|pic|photo|drawing|painting|illustration|artwork|portrait)\b|\b(?:image|picture|portrait)\b[^.!?]{0,90}\b(?:generate|create|make|draw|paint|render)\b/i;

const OFFER_LANGUAGE =
  /\b(?:want|would you like|shall i|should i|can i|could i|let me|i can|i could|how about|if you.d like)\b/i;

export function imagePromptFromConfirmation(
  text: string,
  messages: Pick<Message, 'role' | 'content'>[],
): string | null {
  if (!CONFIRMATION.test(text.trim())) return null;

  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return null;

  const offer = last.content.trim();

  if (!IMAGE_OFFER.test(offer) || !OFFER_LANGUAGE.test(offer)) {
    return null;
  }

  // Prefer the subject Raialume explicitly offered to depict.
  // Do not substitute an unrelated earlier user message.
  const explicitSubject = offer.match(
    /\b(?:image|picture|pic|photo|drawing|painting|illustration|artwork|portrait)\s+of\s+([^?.!]+)/i,
  );

  if (explicitSubject) {
    const subject = explicitSubject[1].trim();

    const descriptiveSubject = subject.replace(/^(?:that|this)\s+/i, '').trim();

    if (
      descriptiveSubject.length >= 3 &&
      !/^(?:that|it|this|what we discussed|the thing we discussed)$/i.test(
        descriptiveSubject,
      )
    ) {
      return `Create an image of ${descriptiveSubject}.`;
    }
  }

  // Only resolve a contextual reference when the earlier user request
  // itself clearly asks for an image.
  const previousUser = [...messages.slice(0, -1)]
    .reverse()
    .find(message => message.role === 'user' && message.content.trim());

  if (!previousUser) return null;

  const subject = previousUser.content.trim();

  if (subject.length < 12) return null;

  // Reuse the existing direct-image intent detector rather than guessing
  // whether unrelated conversation text is an image request.
  const DIRECT_IMAGE_REQUEST =
    /\b(?:generate|create|make|draw|paint|render|illustrate)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|portrait|drawing|painting|illustration|artwork)\b|\b(?:paint|draw)\s+me\s+(?:an?\s+)?(?:sunrise|sunset|landscape|scene|portrait)\b/i;

  if (!DIRECT_IMAGE_REQUEST.test(subject)) return null;

  return `Create an image based on this request: ${subject}`;
}
