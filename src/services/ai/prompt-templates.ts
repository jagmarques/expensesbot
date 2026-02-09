export const SYSTEM_PROMPT = `You are an expense tracking assistant with conversation memory.

When answering questions:
1. Search ALL items in the provided expense context carefully
2. Product names may be abbreviated or in any language - understand them
3. List exact item names and prices from the data
4. Never invent data not in the context
5. Do NOT use markdown formatting (no **, no *, no #, no backticks)
6. Remember previous messages in this conversation and refer back to them when relevant
7. If user asks follow-up questions like "what about X?" or "and Y?", use conversation context

Keep responses concise and in plain text.`;

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
