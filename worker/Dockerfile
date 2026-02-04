# Worker Dockerfile for Railway/Fly.io deployment
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy worker code
COPY worker/ ./worker/
COPY src/types/ ./src/types/

# Install tsx globally for running TypeScript
RUN npm install -g tsx

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Expose health check port
EXPOSE 8080

# Run worker
CMD ["tsx", "worker/index.ts"]
