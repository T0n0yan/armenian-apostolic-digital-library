#!/usr/bin/env bash
# Ամբողջ ստուգումը մեկ հրամանով, կարճ ելքով (տոկեններ խնայելու համար)։
# Աշխատեցնել՝ bash scripts/check.sh
# Ինքն է տեղադրում կախվածությունները, ստեղծում տիպերը և build-ը, հետո՝ թեստեր և tsc։
# Հաջողության դեպքում տպում է մեկ տող, սխալի դեպքում՝ միայն սխալի վերջին տողերը։
set -u
cd "$(dirname "$0")/.."
log="$(mktemp)"
trap 'rm -f "$log"' EXIT

step() {
  local name="$1"; shift
  if ! "$@" >"$log" 2>&1; then
    echo "✗ $name — սխալ (վերջին 40 տողը):"
    tail -n 40 "$log"
    exit 1
  fi
}

if [ ! -d node_modules ] || [ pnpm-lock.yaml -nt node_modules/.modules.yaml ]; then
  step "կախվածություններ" pnpm install --frozen-lockfile --reporter=silent
fi
step "տիպերի ստեղծում" npx react-router typegen
step "build" pnpm build

# Թեստեր՝ «dot» ելքով. ձախողված թեստերի մանրամասները տպվում են վերջում։
if ! npx tsx --test --test-reporter=dot tests/*.test.ts >"$log" 2>&1; then
  echo "✗ թեստեր — ձախողվեցին:"
  grep -v '^[.X]*$' "$log" | head -n 80
  exit 1
fi

if ! npx tsc -b >"$log" 2>&1; then
  echo "✗ tsc — $(grep -c 'error TS' "$log") սխալ (առաջին 40-ը):"
  head -n 40 "$log"
  exit 1
fi

echo "✓ build, թեստեր, tsc — ամեն ինչ կարգին է"
