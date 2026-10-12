export type MemorySubjectValue = 'user' | 'companion' | 'shared' | 'unknown';

function normalized(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function escaped(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function memorySubjectIssue(
  content: string,
  subject: MemorySubjectValue,
  companionName: string,
  type = 'semantic',
): string | null {
  const text = normalized(content);
  if (!text) return 'Memory wording cannot be empty.';

  const userPrefix = /^(?:the user(?:'s|’s)?\b|i\b|i['’]m\b|my\b)/i;
  const genericCompanion = /^(?:the companion(?:'s|’s)?\b)/i;
  const sharedPrefix = /^(?:we\b|our\b)/i;
  const name = escaped(normalized(companionName));
  const companionPrefix = name
    ? new RegExp(`^(?:${name}(?:'s|’s)?\\b|${name}\\s+(?:wants|prefers|likes|loves|is|has|needs|plans|hopes)\\b)`, 'i')
    : null;
  const explicitShared = sharedPrefix.test(text) || (
    !!name && new RegExp(`^(?:the user and ${name}\\b|${name} and the user\\b)`, 'i').test(text)
  );

  if (explicitShared) {
    if (subject === 'shared') return null;
    if (subject === 'unknown') {
      return 'This wording clearly describes both of you. Choose Both or edit the wording.';
    }
    return 'This wording describes both of you. Choose Both or edit the wording.';
  }

  if (subject === 'companion' && userPrefix.test(text)) {
    return `This wording describes you, but the subject is ${companionName || 'Companion'}. Edit the wording or choose You or Both.`;
  }

  if (subject === 'user' &&
      (genericCompanion.test(text) || !!companionPrefix?.test(text))) {
    return `This wording describes ${companionName || 'the companion'}, but the subject is You. Edit the wording or change the subject.`;
  }

  if (subject === 'unknown') {
    if (userPrefix.test(text)) {
      return 'This wording clearly describes you. Choose You or edit the wording.';
    }
    if (genericCompanion.test(text) || !!companionPrefix?.test(text)) {
      return `This wording clearly describes ${companionName || 'the companion'}. Choose that subject or edit the wording.`;
    }
  }

  return null;
}
