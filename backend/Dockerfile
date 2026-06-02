# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production Runtime
FROM node:20-alpine AS runner
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /usr/src/app/dist ./dist

# Create folders for database and upload persistence
RUN mkdir -p data uploads && chown -R node:node /usr/src/app

USER node
ENV PORT=5001
ENV NODE_ENV=production

EXPOSE 5001
CMD ["node", "dist/server.js"]
