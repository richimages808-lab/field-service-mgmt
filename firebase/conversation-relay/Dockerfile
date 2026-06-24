FROM node:20-slim

WORKDIR /app

# Install all deps (including devDeps for build)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Remove devDeps for smaller image
RUN npm prune --production

ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/server.js"]
