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

# Build the app
COPY src ./src
RUN npm run build

# Prepare production dependencies separately
FROM node:22.12-alpine3.20 AS prod-deps
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci --omit=dev --silent

############################
# 2) Production Stage
############################
FROM gcr.io/distroless/nodejs22-debian12:latest
WORKDIR /app

# Copy only what's needed
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000

CMD ["dist/index.js"]
