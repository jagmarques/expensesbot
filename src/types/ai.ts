export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIRequest {
  systemPrompt: string;
  userMessage: string;
  context?: string;
  history?: ChatMessage[];
}

export interface AIResponse {
  text: string;
}

export interface RateLimitStatus {
  dailyUsed: number;
  dailyLimit: number;
  isLimited: boolean;
  resetsAt: string;
}
