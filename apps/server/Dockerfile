ARG NODE_IMAGE=node:22.19.0-alpine3.22
FROM ${NODE_IMAGE}

ENV NODE_ENV=production
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/package.json
RUN pnpm install --frozen-lockfile --prod --filter server

COPY apps/server/dist ./apps/server/dist
RUN mkdir -p /workspace/apps/server/data \
    && chown -R node:node /workspace/apps/server/data

WORKDIR /workspace/apps/server
USER node

EXPOSE 3002
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=6 \
    CMD node -e "fetch('http://127.0.0.1:3002/api/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
