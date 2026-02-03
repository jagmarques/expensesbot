import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../../config/env';
import { GeminiRequest, GeminiResponse } from '../../types/ai';
import { canMakeRequest, recordRequest } from './rate-limiter';
import { GEMINI_MODEL, GEMINI_RESPONSE_TIMEOUT_MS, GEMINI_MAX_RETRIES } from '../../config/constants';

let genAI: GoogleGenerativeAI | null = null;

export function initializeGemini(): GoogleGenerativeAI | null {
  if (!env.GEMINI_API_KEY) {
    console.log('[Gemini] No API key configured');
    return null;
  }
  
  if (!genAI) {
    genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }
  
  return genAI;
}

export async function generateResponse(request: GeminiRequest): Promise<GeminiResponse> {
  if (!canMakeRequest()) {
    throw new Error('Gemini API rate limit reached (1500/day)');
  }

  const client = initializeGemini();
  if (!client) {
    throw new Error('Gemini API not initialized (missing API key)');
  }

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < GEMINI_MAX_RETRIES; attempt++) {
    try {
      const model = client.getGenerativeModel({ model: GEMINI_MODEL });
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API timeout')), GEMINI_RESPONSE_TIMEOUT_MS)
      );

      const prompt = request.context 
        ? `${request.context}\n\nUser: ${request.userMessage}`
        : request.userMessage;

      const result = Promise.race([
        model.generateContent({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          systemInstruction: request.systemPrompt,
        }),
        timeout,
      ]);

      const response = await result;
      const text = response.response.text();

      recordRequest();
      console.log('[Gemini] Response generated successfully');
      
      return {
        text,
        finishReason: response.response.candidates?.[0]?.finishReason,
      };
    } catch (error: any) {
      lastError = error;
      console.error(`[Gemini] Attempt ${attempt + 1} failed:`, error.message);
      
      if (error.message.includes('429')) {
        throw new Error('Gemini API quota exceeded');
      }
      
      if (attempt < GEMINI_MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  throw lastError || new Error('Gemini API failed after retries');
}
