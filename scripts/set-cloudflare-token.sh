#!/usr/bin/env bash
# Asks for the Cloudflare API token (hidden), verifies it with Cloudflare, and only then stores it
# as the CLOUDFLARE_API_TOKEN GitHub Actions secret. The token is never printed or saved to disk.
set -euo pipefail
# Works when opened from Finder/Terminal.app too: gh needs to run inside the repository.
cd "$(dirname "$0")/.."

account_id="21a44c0e3a9d7bfcb5f57539fc7b6451"
token=""
while [[ -z "$token" ]]; do
  read -rsp "Paste the Cloudflare API token (Cmd+V), then press Enter: " token
  echo
  token="$(printf %s "$token" | tr -d '[:space:]')"
  [[ -z "$token" ]] && echo "Nothing was pasted. Copy the token on the Cloudflare page and try again."
done
echo "Token length: ${#token} characters (a Cloudflare token is usually 40–60)."

verify() { curl -s -H "Authorization: Bearer $token" "$1" | grep -o '"status":"active"' || true; }
if [[ -n "$(verify "https://api.cloudflare.com/client/v4/user/tokens/verify")" || -n "$(verify "https://api.cloudflare.com/client/v4/accounts/$account_id/tokens/verify")" ]]; then
  echo "Cloudflare accepted the token."
else
  echo "Cloudflare rejected this token. Copy it again from the Cloudflare page and rerun this script."
  exit 1
fi

if curl -s -H "Authorization: Bearer $token" "https://api.cloudflare.com/client/v4/accounts/$account_id/d1/database" | grep -q '"success":true'; then
  echo "D1 access: OK"
else
  echo "The token cannot read D1. Check it has Account · D1 · Edit for this account."
  exit 1
fi

printf %s "$token" | gh secret set CLOUDFLARE_API_TOKEN
unset token
echo "Saved to GitHub."
echo
read -rp "Press Enter to close this window." _
