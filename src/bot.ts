import { Bot, InlineKeyboard } from 'grammy';
import { Prisma } from '@prisma/client';
import { config } from './config.js';
import { db } from './db/client.js';
import { createExchange, estimateAmount, getExchange, listCurrencies, minimumAmount } from './services/changenow.js';

export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

const popular = ['btc', 'eth', 'sol', 'usdttrc20', 'usdtbsc', 'usdc', 'xrp', 'ltc'];
const normalize = (v: string) => v.trim().toLowerCase();
const decimal = (n: number) => new Prisma.Decimal(n.toString());

async function ensureUser(ctx: any) {
  if (!ctx.from) throw new Error('Missing Telegram user');
  return db.user.upsert({
    where: { id: BigInt(ctx.from.id) },
    create: { id: BigInt(ctx.from.id), username: ctx.from.username, firstName: ctx.from.first_name, sessions: { create: {} } },
    update: { username: ctx.from.username, firstName: ctx.from.first_name }
  });
}

async function setSession(userId: bigint, data: Record<string, unknown>) {
  return db.session.upsert({
    where: { userId },
    create: { userId, ...data } as any,
    update: data as any
  });
}

function assetKeyboard(prefix: string) {
  const kb = new InlineKeyboard();
  popular.forEach((ticker, i) => {
    kb.text(ticker.toUpperCase(), `${prefix}:${ticker}`);
    if (i % 2 === 1) kb.row();
  });
  return kb;
}

bot.command('start', async (ctx) => {
  const user = await ensureUser(ctx);
  const kb = new InlineKeyboard()
    .url('Terms', config.TERMS_URL)
    .url('Privacy', config.PRIVACY_URL)
    .row()
    .text('I agree', 'agree');
  await ctx.reply('Crypto exchange bot\n\nNon-custodial swap execution powered by ChangeNOW. Review the Terms and Privacy Policy before continuing.', { reply_markup: kb });
  if (user.acceptedAt) await ctx.reply('You previously accepted the terms. Tap I agree to continue.');
});

bot.callbackQuery('agree', async (ctx) => {
  const user = await ensureUser(ctx);
  await db.user.update({ where: { id: user.id }, data: { acceptedAt: new Date() } });
  await setSession(user.id, { step: 'from', fromAsset: null, toAsset: null, amount: null, payoutAddr: null, payoutExtra: null });
  await ctx.answerCallbackQuery();
  await ctx.reply('Choose the asset you are sending, or type its ticker.', { reply_markup: assetKeyboard('from') });
});

bot.command('new', async (ctx) => {
  const user = await ensureUser(ctx);
  if (!user.acceptedAt) return ctx.reply('Use /start and accept the terms first.');
  await setSession(user.id, { step: 'from', fromAsset: null, toAsset: null, amount: null, payoutAddr: null, payoutExtra: null });
  return ctx.reply('Choose the asset you are sending, or type its ticker.', { reply_markup: assetKeyboard('from') });
});

bot.command('status', async (ctx) => {
  await ensureUser(ctx);
  const id = ctx.match?.trim();
  if (!id) return ctx.reply('Usage: /status <exchange-id>');
  const tx = await getExchange(id);
  return ctx.reply(`Exchange ${tx.id}\nStatus: ${tx.status}${tx.payoutHash ? `\nPayout tx: ${tx.payoutHash}` : ''}`);
});

bot.command('history', async (ctx) => {
  const user = await ensureUser(ctx);
  const items = await db.exchange.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 10 });
  if (!items.length) return ctx.reply('No exchanges yet.');
  return ctx.reply(items.map(x => `${x.id} — ${x.fromAsset.toUpperCase()}→${x.toAsset.toUpperCase()} — ${x.status}`).join('\n'));
});

bot.command('help', (ctx) => ctx.reply('/new — start a swap\n/status <id> — check an exchange\n/history — recent exchanges\n/support — support contact'));
bot.command('support', (ctx) => ctx.reply(`Support: ${config.SUPPORT_CONTACT}`));

bot.callbackQuery(/^from:(.+)$/, async (ctx) => {
  const user = await ensureUser(ctx);
  const ticker = normalize(ctx.match[1]);
  await setSession(user.id, { step: 'to', fromAsset: ticker });
  await ctx.answerCallbackQuery();
  await ctx.reply(`Sending: ${ticker.toUpperCase()}\nChoose the asset you want to receive.`, { reply_markup: assetKeyboard('to') });
});

bot.callbackQuery(/^to:(.+)$/, async (ctx) => {
  const user = await ensureUser(ctx);
  const ticker = normalize(ctx.match[1]);
  await setSession(user.id, { step: 'amount', toAsset: ticker });
  await ctx.answerCallbackQuery();
  const s = await db.session.findUniqueOrThrow({ where: { userId: user.id } });
  const min = await minimumAmount(s.fromAsset!, ticker);
  await ctx.reply(`Pair: ${s.fromAsset!.toUpperCase()} → ${ticker.toUpperCase()}\nMinimum currently: ${min} ${s.fromAsset!.toUpperCase()}\n\nEnter the amount to send.`);
});

bot.on('message:text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  const user = await ensureUser(ctx);
  if (!user.acceptedAt) return ctx.reply('Use /start and accept the terms first.');
  const s = await db.session.findUnique({ where: { userId: user.id } });
  if (!s) return ctx.reply('Use /new to start an exchange.');
  const input = ctx.message.text.trim();

  if (s.step === 'from' || s.step === 'to') {
    const ticker = normalize(input);
    const currencies = await listCurrencies();
    if (!currencies.some(c => normalize(c.ticker) === ticker)) return ctx.reply('That asset/network ticker is not currently available. Try another ticker.');
    if (s.step === 'from') {
      await setSession(user.id, { step: 'to', fromAsset: ticker });
      return ctx.reply(`Sending: ${ticker.toUpperCase()}\nChoose or type the asset you want to receive.`, { reply_markup: assetKeyboard('to') });
    }
    await setSession(user.id, { step: 'amount', toAsset: ticker });
    const min = await minimumAmount(s.fromAsset!, ticker);
    return ctx.reply(`Minimum currently: ${min} ${s.fromAsset!.toUpperCase()}\nEnter the amount to send.`);
  }

  if (s.step === 'amount') {
    const amount = Number(input);
    if (!Number.isFinite(amount) || amount <= 0) return ctx.reply('Enter a valid positive amount.');
    const min = await minimumAmount(s.fromAsset!, s.toAsset!);
    if (amount < min) return ctx.reply(`Amount is below the current minimum of ${min} ${s.fromAsset!.toUpperCase()}.`);
    const estimate = await estimateAmount(amount, s.fromAsset!, s.toAsset!);
    await setSession(user.id, { step: 'address', amount: decimal(amount) });
    return ctx.reply(`Estimated receive amount: ~${estimate} ${s.toAsset!.toUpperCase()}\n\nSend the destination wallet address for ${s.toAsset!.toUpperCase()}. Verify the network carefully.`);
  }

  if (s.step === 'address') {
    if (input.length < 8 || input.length > 200 || /\s/.test(input)) return ctx.reply('That address format is invalid. Check the address and network.');
    await setSession(user.id, { step: 'confirm', payoutAddr: input });
    const fresh = await db.session.findUniqueOrThrow({ where: { userId: user.id } });
    const estimate = await estimateAmount(Number(fresh.amount), fresh.fromAsset!, fresh.toAsset!);
    const kb = new InlineKeyboard().text('Confirm exchange', 'confirm').text('Cancel', 'cancel');
    return ctx.reply(`Confirm exchange\n\nSend: ${fresh.amount} ${fresh.fromAsset!.toUpperCase()}\nEstimated receive: ~${estimate} ${fresh.toAsset!.toUpperCase()}\nDestination: ${input}\n\nBlockchain transactions are irreversible.`, { reply_markup: kb });
  }

  return ctx.reply('Use /new to start a new exchange.');
});

bot.callbackQuery('cancel', async (ctx) => {
  const user = await ensureUser(ctx);
  await setSession(user.id, { step: 'idle', fromAsset: null, toAsset: null, amount: null, payoutAddr: null, payoutExtra: null });
  await ctx.answerCallbackQuery();
  await ctx.reply('Exchange cancelled.');
});

bot.callbackQuery('confirm', async (ctx) => {
  const user = await ensureUser(ctx);
  const s = await db.session.findUniqueOrThrow({ where: { userId: user.id } });
  if (s.step !== 'confirm' || !s.fromAsset || !s.toAsset || !s.amount || !s.payoutAddr) {
    await ctx.answerCallbackQuery({ text: 'Exchange state expired.' });
    return;
  }
  await ctx.answerCallbackQuery({ text: 'Creating exchange…' });
  const tx = await createExchange({
    from: s.fromAsset,
    to: s.toAsset,
    address: s.payoutAddr,
    amount: Number(s.amount),
    userId: user.id.toString(),
    ...(s.payoutExtra ? { extraId: s.payoutExtra } : {})
  });
  const expected = tx.amountExpectedTo ? Number(tx.amountExpectedTo) : undefined;
  await db.exchange.create({
    data: {
      id: tx.id,
      userId: user.id,
      fromAsset: s.fromAsset,
      toAsset: s.toAsset,
      amount: s.amount,
      expectedAmount: expected ? decimal(expected) : null,
      payoutAddress: s.payoutAddr,
      payoutExtraId: s.payoutExtra,
      payinAddress: tx.payinAddress,
      payinExtraId: tx.payinExtraId ?? null,
      status: tx.status,
      payoutHash: tx.payoutHash ?? null
    }
  });
  await setSession(user.id, { step: 'idle', fromAsset: null, toAsset: null, amount: null, payoutAddr: null, payoutExtra: null });
  const memo = tx.payinExtraId ? `\nMemo/Tag: ${tx.payinExtraId}` : '';
  await ctx.reply(`Exchange created\n\nID: ${tx.id}\nSend exactly the selected asset/network to:\n${tx.payinAddress}${memo}\n\nStatus: ${tx.status}\n\nUse /status ${tx.id} to check progress.`);
});

bot.catch(({ error, ctx }) => {
  console.error('Bot error', error);
  void ctx.reply('The exchange service returned an error. No exchange was created. Try again or contact support.').catch(() => undefined);
});
