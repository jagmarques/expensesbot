import { generateResponse } from './deepseek';
import { buildExpenseContext } from './context-builder';
import { SYSTEM_PROMPT } from './prompt-templates';
import { getRateLimitStatus } from './rate-limiter';
import { getConversationHistory, addToHistory } from './conversation-history';

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/^[-*]\s+/gm, '- ');
}

export async function handleAIMessage(userId: string, message: string): Promise<string> {
  try {
    const rateLimitStatus = getRateLimitStatus();

    if (rateLimitStatus.isLimited) {
      return `AI daily limit reached (${rateLimitStatus.dailyUsed}/${rateLimitStatus.dailyLimit}). Try again tomorrow.`;
    }

    const context = await buildExpenseContext(userId);
    const history = getConversationHistory(userId);

    const response = await generateResponse({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: message,
      context,
      history,
    });

    const cleanResponse = stripMarkdown(response.text);

    // Store in conversation history
    addToHistory(userId, message, cleanResponse);

    console.log('[AIHandler] Response generated successfully');
    return cleanResponse;
  } catch (error: any) {
    console.error('[AIHandler] Error:', error.message);

    if (error.message.includes('not configured')) {
      return 'AI features not available. Set DEEPSEEK_API_KEY in .env to enable.';
    }

    if (error.message.includes('rate limit') || error.message.includes('429')) {
      return 'AI quota exceeded. Try again later.';
    }

    if (error.message.includes('timeout')) {
      return 'Request took too long. Try a simpler query.';
    }

    return 'Unable to process query right now. Try using /stats command instead.';
  }
}
