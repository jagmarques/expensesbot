import { env } from '../../config/env';
import { AIRequest, AIResponse } from '../../types/ai';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';
const API_TIMEOUT_MS = 30000;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function isDeepSeekConfigured(): boolean {
  return !!env.DEEPSEEK_API_KEY;
}

export async function generateResponse(request: AIRequest): Promise<AIResponse> {
  if (!env.DEEPSEEK_API_KEY) {
    throw new Error('DeepSeek API not configured (missing DEEPSEEK_API_KEY)');
  }

  const messages: ChatMessage[] = [];

  if (request.systemPrompt) {
    messages.push({ role: 'system', content: request.systemPrompt });
  }

  // Add conversation history
  if (request.history && request.history.length > 0) {
    for (const msg of request.history) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  let userContent = request.userMessage;
  if (request.context) {
    userContent = `${request.context}\n\nUser: ${request.userMessage}`;
  }

  messages.push({ role: 'user', content: userContent });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages,
        temperature: 0.1,
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[DeepSeek] API error:', response.status, errorText);
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const data = await response.json() as any;
    const text = data.choices?.[0]?.message?.content || '';

    console.log('[DeepSeek] Response generated successfully');

    return { text };
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error('DeepSeek API timeout');
    }
    throw error;
  }
}

export async function generateDeepSeekResponse(request: { systemPrompt?: string; userMessage: string }): Promise<AIResponse> {
  return generateResponse({
    systemPrompt: request.systemPrompt || '',
    userMessage: request.userMessage,
  });
}
