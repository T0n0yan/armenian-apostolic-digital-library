#!/usr/bin/env bash
# One-time setup of the hourly GitHub Actions sync. Run from the repository root:
#   bash scripts/setup-github-sync.sh
# Values are piped to `gh` and never printed. The Cloudflare token is pasted by you at the prompt.
set -euo pipefail

env_file="services/telegram-bridge/.env.local"
# Values in .env.local may be wrapped in quotes; GitHub secrets must hold the bare value.
value() { grep -E "^$1=" "$env_file" | head -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'; }

echo "1/4  Telegram API keys → GitHub secrets"
for key in TELEGRAM_API_ID TELEGRAM_API_HASH; do
  printf %s "$(value "$key")" | gh secret set "$key"
done
openssl rand -hex 32 | gh secret set TELEGRAM_BRIDGE_SHARED_SECRET

echo "2/4  Non-secret settings → GitHub variables"
gh variable set TELEGRAM_CONTENT_CHAT_ID --body "$(value TELEGRAM_CONTENT_CHAT_ID)"
gh variable set CLOUDFLARE_ACCOUNT_ID --body "21a44c0e3a9d7bfcb5f57539fc7b6451"
gh variable set CLOUD_SYNC_ENV --body "staging"

echo "3/4  Paste the Cloudflare API token (input is hidden), then press Enter:"
gh secret set CLOUDFLARE_API_TOKEN

echo "4/4  New Telegram session for GitHub (phone, code, 2FA are asked by Telegram):"
pnpm -s telegram:authorize --github-secret

echo "Done. Start a first run with: gh workflow run cloud-sync.yml"
