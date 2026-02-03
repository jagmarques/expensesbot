import { generateResponse } from './gemini';
import { buildExpenseContext } from './context-builder';
import { SYSTEM_PROMPT } from './prompt-templates';
import { getRateLimitStatus } from './rate-limiter';

export async function handleAIMessage(userId: string, message: string): Promise<string> {
  try {
    const rateLimitStatus = getRateLimitStatus();

    if (rateLimitStatus.isLimited) {
      return `AI daily limit reached (${rateLimitStatus.dailyUsed}/${rateLimitStatus.dailyLimit}). Try again tomorrow.`;
    }

    const context = await buildExpenseContext(userId);

    const response = await generateResponse({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: message,
      context,
    });

    console.log('[AIHandler] Response generated successfully');
    return response.text;
  } catch (error: any) {
    console.error('[AIHandler] Error:', error.message);

    if (error.message.includes('not initialized')) {
      return 'AI features not available. Set GEMINI_API_KEY in .env to enable.';
    }

    if (error.message.includes('quota exceeded')) {
      return 'AI quota exceeded. Try again later.';
    }

    if (error.message.includes('timeout')) {
      return 'Request took too long. Try a simpler query.';
    }

    return 'Unable to process query right now. Try using /stats command instead.';
  }
}
