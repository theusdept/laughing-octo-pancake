import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_URL: z.string().url(),
  TELEGRAM_BOT_TOKEN: z.string().min(20),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16),
  DATABASE_URL: z.string().min(1),
  CHANGENOW_API_KEY: z.string().min(8),
  CHANGENOW_API_BASE: z.string().url().default('https://changenow.io/api/v1'),
  CHANGENOW_CURRENCY_URL: z.string().url().default('https://api.changenow.io/v2/exchange/currencies?active=true&flow=standard&buy=&sell='),
  SUPPORT_CONTACT: z.string().default('@support'),
  TERMS_URL: z.string().url().default('https://changenow.io/terms-of-use'),
  PRIVACY_URL: z.string().url().default('https://changenow.io/privacy-policy')
});

export const config = schema.parse(process.env);
