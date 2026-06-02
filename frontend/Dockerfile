# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Nginx Web Server
FROM nginx:alpine
COPY --from=builder /usr/src/app/dist /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
