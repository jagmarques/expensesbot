import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  GOOGLE_VISION_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  DB_PATH: z.string().default('./data/expenses.db'),
  DEFAULT_CURRENCY: z.string().default('EUR'),
  DEFAULT_TIMEZONE: z.string().default('Europe/Lisbon'),
  RECEIPT_RETENTION_DAYS: z.string().default('90').transform(Number),
  HEALTH_PORT: z.string().default('5000').transform(Number),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  require('dotenv').config();

  return envSchema.parse(process.env);
}

export const env = loadEnv();
