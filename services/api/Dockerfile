# MoneyTail API — production image (monorepo workspaces)
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/api/package.json services/api/
RUN npm ci -w @moneytail/shared -w @moneytail/api

FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/package-lock.json ./
COPY --from=deps /app/packages/shared/package.json ./packages/shared/
COPY --from=deps /app/services/api/package.json ./services/api/
COPY packages/shared ./packages/shared
COPY services/api ./services/api
RUN npx prisma generate --schema services/api/prisma/schema.prisma
RUN npm run build -w @moneytail/shared && npm run build -w @moneytail/api

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/services/api/package.json ./services/api/
COPY --from=build /app/services/api/dist ./services/api/dist
COPY --from=build /app/services/api/prisma ./services/api/prisma
WORKDIR /app/services/api
ENV API_PORT=3001
ENV DATABASE_URL="file:/data/prod.db"
RUN mkdir -p /data
EXPOSE 3001
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/main.js"]
