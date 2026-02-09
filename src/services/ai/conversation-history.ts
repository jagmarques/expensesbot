interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_HISTORY_MESSAGES = 50;

const conversationStore = new Map<string, Message[]>();

export function getConversationHistory(userId: string): Message[] {
  return conversationStore.get(userId) || [];
}

export function addToHistory(userId: string, userMessage: string, assistantResponse: string): void {
  const history = conversationStore.get(userId) || [];

  history.push(
    { role: 'user', content: userMessage },
    { role: 'assistant', content: assistantResponse }
  );

  // Keep only the last N messages
  if (history.length > MAX_HISTORY_MESSAGES) {
    conversationStore.set(userId, history.slice(-MAX_HISTORY_MESSAGES));
  } else {
    conversationStore.set(userId, history);
  }
}

export function clearConversationHistory(userId: string): void {
  conversationStore.delete(userId);
}
