#!/usr/bin/env bash
# Stores the Telegram bot token the Mini App is opened from, so the site can verify who is signed in
# (needed for saving to "Իմ անկյունը"). The token is checked with Telegram, never printed or saved
# to disk, and only stored after you confirm the bot name.
#   bash scripts/set-bot-token.sh [staging|production]
set -euo pipefail
cd "$(dirname "$0")/.."
environment="${1:-staging}"

token=""
while [[ -z "$token" ]]; do
  read -rsp "Paste the bot token from @BotFather (Cmd+V), then press Enter: " token
  echo
  token="$(printf %s "$token" | tr -d '[:space:]')"
  [[ -z "$token" ]] && echo "Nothing was pasted. In @BotFather: /mybots → your bot → API Token, copy it, and try again."
done

username="$(curl -s "https://api.telegram.org/bot${token}/getMe" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p')"
if [[ -z "$username" ]]; then
  echo "Telegram did not accept this token. Copy it again from @BotFather and rerun."
  exit 1
fi
read -rp "This is the token of @${username}. Store it for ${environment}? [y/N] " answer
if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
  echo "Nothing was changed."
  exit 1
fi

printf %s "$token" | pnpm exec wrangler secret put TELEGRAM_BOT_TOKEN --env "$environment"
unset token
echo "Done. Close and reopen the Mini App, then try saving a material."
echo
read -rp "Press Enter to close this window." _
