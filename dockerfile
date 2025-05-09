# syntax=docker/dockerfile:1.4

############################
# 1) Build Stage
############################
FROM node:22.12-alpine3.20 AS builder
WORKDIR /usr/src/app

# Cache deps
COPY package*.json tsconfig*.json ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci --silent

# Build
COPY src ./src
RUN npm run build

############################
# 2) Production Stage
############################
FROM gcr.io/distroless/nodejs:22
WORKDIR /app

# Copy manifests & artifacts
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/dist ./dist

# Install prod deps
RUN npm ci --omit=dev --silent

EXPOSE 3000

# 2.5 Entrypoint
CMD ["node", "dist/index.js"]