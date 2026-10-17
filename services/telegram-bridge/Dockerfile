FROM node:22-bookworm-slim AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod=false --ignore-scripts \
    && pnpm exec tsx --version

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV TELEGRAM_BRIDGE_HOST=0.0.0.0
ENV TELEGRAM_BRIDGE_PORT=8788

RUN corepack enable
WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared ./shared
COPY services/telegram-bridge ./services/telegram-bridge
# The cloud sync writes D1/R2 through Wrangler, which resolves bindings from wrangler.jsonc.
COPY wrangler.jsonc ./

RUN chown -R node:node /app
USER node

EXPOSE 8788

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "const secret=process.env.TELEGRAM_BRIDGE_SHARED_SECRET;const port=process.env.TELEGRAM_BRIDGE_PORT||'8788';fetch('http://127.0.0.1:'+port+'/ready',{headers:{authorization:'Bearer '+secret}}).then(response=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "--import", "tsx", "services/telegram-bridge/src/server.ts"]
