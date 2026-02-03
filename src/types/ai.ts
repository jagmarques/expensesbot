export interface GeminiRequest {
  systemPrompt: string;
  userMessage: string;
  context?: string;
}

export interface GeminiResponse {
  text: string;
  tokenCount?: number;
  finishReason?: string;
}

export interface RateLimitStatus {
  dailyUsed: number;
  dailyLimit: number;
  isLimited: boolean;
  resetsAt: string;
}
