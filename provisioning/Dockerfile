# Stage 1: Build
FROM node:26.11.1 AS builder
ENV CI=true
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter shared build
RUN pnpm --filter server build

# Stage 2: Production
FROM node:26.11.1-slim
ENV CI=true
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy only workspace-related files for installation
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY web/client/package.json ./web/client/
COPY web/server/package.json ./web/server/
COPY web/shared/package.json ./web/shared/

# Install only production dependencies
RUN pnpm install --prod --frozen-lockfile --filter server...

# Copy built application, shared data and workspace files from builder
COPY --from=builder /app/web/server/dist ./web/server/dist
COPY --from=builder /app/web/server/migrations ./web/server/migrations
COPY --from=builder /app/web/server/fixtures ./web/server/fixtures
COPY --from=builder /app/web/shared/dist ./web/shared/dist
COPY --from=builder /app/web/shared/data ./web/shared/data

# Verify build output exists at the correct path
RUN ls -lah /app/web/server/dist

EXPOSE 3001

CMD ["pnpm", "--filter", "server", "start"]
