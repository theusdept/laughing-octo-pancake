import { z } from 'zod';
import { config } from '../config.js';

const currencySchema = z.object({
  ticker: z.string(),
  name: z.string().optional(),
  network: z.string().optional(),
  hasExtraId: z.boolean().optional(),
  isExtraIdMandatory: z.boolean().optional()
}).passthrough();

const txSchema = z.object({
  id: z.string(),
  payinAddress: z.string(),
  payinExtraId: z.string().nullable().optional(),
  payoutAddress: z.string().optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  amountExpectedFrom: z.union([z.string(), z.number()]).optional(),
  amountExpectedTo: z.union([z.string(), z.number()]).optional(),
  status: z.string().default('waiting'),
  payoutHash: z.string().nullable().optional()
}).passthrough();

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(init?.headers ?? {})
      }
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`ChangeNOW ${response.status}: ${body.slice(0, 500)}`);
    return JSON.parse(body) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function listCurrencies() {
  const raw = await request<unknown[]>(config.CHANGENOW_CURRENCY_URL);
  return z.array(currencySchema).parse(raw);
}

export async function minimumAmount(from: string, to: string): Promise<number> {
  const url = `${config.CHANGENOW_API_BASE}/min-amount/${encodeURIComponent(`${from}_${to}`)}?api_key=${encodeURIComponent(config.CHANGENOW_API_KEY)}`;
  const raw = await request<{ minAmount: number | string }>(url);
  return Number(raw.minAmount);
}

export async function estimateAmount(amount: number, from: string, to: string): Promise<number> {
  const url = `${config.CHANGENOW_API_BASE}/exchange-amount/${encodeURIComponent(String(amount))}/${encodeURIComponent(`${from}_${to}`)}?api_key=${encodeURIComponent(config.CHANGENOW_API_KEY)}`;
  const raw = await request<{ estimatedAmount: number | string } | number | string>(url);
  if (typeof raw === 'number' || typeof raw === 'string') return Number(raw);
  return Number(raw.estimatedAmount);
}

export async function createExchange(input: {
  from: string;
  to: string;
  address: string;
  amount: number;
  extraId?: string;
  userId: string;
}) {
  const url = `${config.CHANGENOW_API_BASE}/transactions/${encodeURIComponent(config.CHANGENOW_API_KEY)}`;
  const raw = await request<unknown>(url, {
    method: 'POST',
    body: JSON.stringify(input)
  });
  return txSchema.parse(raw);
}

export async function getExchange(id: string) {
  const url = `${config.CHANGENOW_API_BASE}/transactions/${encodeURIComponent(id)}/${encodeURIComponent(config.CHANGENOW_API_KEY)}`;
  const raw = await request<unknown>(url);
  return txSchema.parse(raw);
}
