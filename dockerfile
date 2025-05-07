# --------------> Build stage
FROM node:22.12-alpine3.20 AS builder

WORKDIR /usr/src/app

COPY package*.json ./
COPY tsconfig*.json ./

COPY ./src ./src
RUN npm ci --quiet && npm run build

# --------------> Production stage
FROM node:22.12-alpine3.20

RUN apk add dumb-init

WORKDIR /app

ENV NODE_ENV=production

COPY --chown=node:node package*.json ./
COPY --chown=node:node --from=builder /usr/src/app/dist ./dist

RUN npm ci --quiet --only=production

USER node

CMD ["dumb-init", "node", "dist/index.js"]
