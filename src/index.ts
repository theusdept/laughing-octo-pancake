import Fastify from 'fastify';
import { webhookCallback } from 'grammy';
import { bot } from './bot.js';
import { config } from './config.js';
import { db } from './db/client.js';
import { getExchange } from './services/changenow.js';

const app = Fastify({ logger: true, trustProxy: true });
const webhookPath = `/telegram/${config.TELEGRAM_WEBHOOK_SECRET}`;

app.get('/health', async () => ({ ok: true }));
app.post(webhookPath, webhookCallback(bot, 'fastify'));

async function syncOpenExchanges() {
  const open = await db.exchange.findMany({
    where: { status: { in: ['new', 'waiting', 'confirming', 'exchanging', 'sending', 'verifying'] } },
    take: 100
  });
  for (const item of open) {
    try {
      const remote = await getExchange(item.id);
      if (remote.status !== item.status || remote.payoutHash !== item.payoutHash) {
        await db.exchange.update({ where: { id: item.id }, data: { status: remote.status, payoutHash: remote.payoutHash ?? null } });
        await bot.api.sendMessage(item.userId.toString(), `Exchange ${item.id} status: ${remote.status}${remote.payoutHash ? `\nPayout tx: ${remote.payoutHash}` : ''}`);
      }
    } catch (error) {
      app.log.error({ error, exchangeId: item.id }, 'status sync failed');
    }
  }
}

async function main() {
  await db.$connect();
  await bot.api.setMyCommands([
    { command: 'start', description: 'Start the bot and review terms' },
    { command: 'new', description: 'Start a new crypto exchange' },
    { command: 'status', description: 'Check exchange status by ID' },
    { command: 'history', description: 'Show recent exchanges' },
    { command: 'support', description: 'Contact support' },
    { command: 'help', description: 'Show commands' }
  ]);
  await bot.api.setWebhook(`${config.PUBLIC_URL}${webhookPath}`, {
    secret_token: config.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message', 'callback_query']
  });
  setInterval(() => void syncOpenExchanges(), 30_000).unref();
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
