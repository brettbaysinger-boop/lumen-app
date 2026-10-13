/**
 * Advisory durability warning for intentional human saves/approvals.
 *
 * Never silently blocks a user-authorized save. Natural observation
 * extraction has a stronger, server-side skip/review decision.
 * Read evidence as well as normalized wording to avoid laundering a request.
 */
export function memoryDurabilityWarning(content: string, evidence?: string): string | null {
  const source = (evidence || content).trim().replace(/\s+/g, ' ');
  if (!source) return null;

  const assertion = /\b(?:i|im|my|mine|our|we(?:['’]?re| are))\b/i.test(source);
  const oneOff = /^(?:(?:dammit|please|hey|okay)[,!.\s]+)*(?:tell|show|give|send|play|read|write|draw|generate|translate|summarize|explain|try again|repeat|say)\s+/i;
  const oneOffQuestion = /^(?:(?:please|hey)[,!.\s]+)*(?:can|could|would|will) you\s+(?:tell|show|give|send|play|read|write|draw|generate|translate|summarize|explain)\b/i;
  const greeting = /^(?:hi|hello|hey|good morning|good afternoon|good evening|good night)\b/i;
  const address = /(?:\b(?:will|can|could|would) you\s+(?:please\s+)?call me\b|^(?:please\s+)?call me\b|\bcall me\b.*\bfrom now on\b|^from now on[, ]+call me\b)/i;
  const hearMe = /\b(?:can|could|do) you (?:hear|see) me\b/i;
  const ephemeral = /^(?:i(?:['’]?m| am)|im)\s+(?:hungry|tired|bored|sleepy|horny|horney|frustrated|exhausted)\b/i;
  const feedback = /^(?:still\b|try again\b|not quite\b|nope\b|nah\b|wtf\b|that's wrong\b|that is wrong\b)/i;
  const question = /\?$/.test(source) || /^(?:what|when|where|who|why|how|which|did|do|does|are|is|can|could|will|would|should|have|has)\b/i.test(source);

  if (address.test(source)) {
    return 'This is a request for a form of address. Make sure the saved wording reflects what you want remembered.';
  }
  if (ephemeral.test(source)) {
    return 'This sounds like a temporary feeling or reaction, not a lasting preference.';
  }
  if (hearMe.test(source)) {
    return 'This looks like a one-time microphone or connection check.';
  }
  if (oneOff.test(source) || oneOffQuestion.test(source)) {
    return 'This looks like a one-time request, not necessarily a lasting fact.';
  }
  if (greeting.test(source) && !assertion) {
    return 'This is a greeting, not necessarily a lasting fact.';
  }
  if (feedback.test(source) && !assertion) {
    return 'This sounds like temporary feedback from the current conversation.';
  }
  if (question) {
    return assertion
      ? 'This is phrased as a question. Make sure the saved fact expresses only what was actually stated.'
      : 'This looks like a question rather than a lasting fact. Consider editing the wording.';
  }
  return null;
}
