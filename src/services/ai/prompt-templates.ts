export const SYSTEM_PROMPT = `You are an expense tracking assistant.
Answer questions about the user's spending based on their expense history provided below.
Be concise and helpful. Format monetary amounts clearly.
If asked about data not in the context, say you only have access to their expense records.
Never mention that you are an AI or language model.

Guidelines:
- Use the exact amounts from the provided context
- Round percentages to whole numbers
- Compare to previous periods when relevant
- Keep responses under 500 characters for Telegram`;

export function buildUserPrompt(query: string, context: string): string {
  return `${context}\n\nUser Question: ${query}`;
}

const QUERY_PATTERNS = [
  /how much/i,
  /what did i spend/i,
  /total spent/i,
  /spending on/i,
  /compare.*spending/i,
  /average/i,
  /most expensive/i,
  /category breakdown/i,
  /trend/i,
  /insight/i,
];

export function isExpenseQuery(message: string): boolean {
  return QUERY_PATTERNS.some(pattern => pattern.test(message));
}
