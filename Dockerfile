FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate && pnpm install --frozen-lockfile --prod

COPY public ./public
COPY src ./src
COPY scripts ./scripts
COPY data/seed-data.json ./data/seed-data.json
COPY docker/entrypoint.sh ./docker/entrypoint.sh

RUN chmod +x /app/docker/entrypoint.sh && mkdir -p /app/data

EXPOSE 3000

CMD ["/app/docker/entrypoint.sh"]
