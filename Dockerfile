# ========================
# Stage 1: Build
# ========================
FROM node:24-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm@10.14.0

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install || npm install

COPY . .
RUN pnpm build || npm run build

# ========================
# Stage 2: Production
# ========================
FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3116

ENV NODE_ENV=production
ENV PORT=3116

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3116}/health || exit 1

CMD ["node", "dist/main.js"]
