type ConversationDisplayFields = {
  conversationId: string;
  conversationName?: string | null;
  originalAudioFileName?: string | null;
};

export const getConversationDisplayName = (call: ConversationDisplayFields) => {
  const conversationName = call.conversationName?.trim();
  const originalAudioFileName = call.originalAudioFileName?.trim();
  const primaryName = conversationName || originalAudioFileName || call.conversationId;

  return originalAudioFileName && primaryName !== originalAudioFileName
    ? `${primaryName} — ${originalAudioFileName}`
    : primaryName;
};
