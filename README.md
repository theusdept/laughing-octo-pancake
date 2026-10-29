# Crypto Exchange Telegram Bot

Standalone non-custodial Telegram exchange bot using ChangeNOW.

## Features

- Telegram webhook mode
- Terms/privacy acceptance gate
- Dynamic supported-currency lookup
- Dynamic minimum amount and estimate checks
- Exchange creation returning ChangeNOW pay-in address
- Persistent users, sessions, and exchanges in PostgreSQL
- `/status` and `/history`
- Background status polling with Telegram notifications
- Docker + Railway deployment
- No private keys, seed phrases, or custody of user funds

## Commands

- `/start` — initialize and accept terms
- `/new` — create exchange
- `/status <exchange-id>` — fetch current status
- `/history` — recent exchanges
- `/support` — support contact
- `/help` — command list

## Deploy

1. Create a PostgreSQL service.
2. Copy `.env.example` values into production variables.
3. Set `PUBLIC_URL` to the deployed HTTPS URL.
4. Set `TELEGRAM_BOT_TOKEN` and `CHANGENOW_API_KEY` as secrets.
5. Generate an initial Prisma migration locally with `npx prisma migrate dev --name init`, commit the generated migration, then deploy.

## Important integration notes

ChangeNOW's API configuration is account-specific. Standard swap endpoints use the public partner API key. Some v2/fixed-rate/refund/validation features require enablement by ChangeNOW. Keep `CHANGENOW_API_BASE` configurable so the bot can use the endpoint family enabled for the business account.

Do not collect wallet private keys or seed phrases. A user only supplies the destination address for the asset they want to receive.
