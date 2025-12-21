# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (layer caching)
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript (includes knexfile.ts compilation)
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling and wget for health checks
RUN apk add --no-cache dumb-init wget

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install production dependencies only (--ignore-scripts skips husky prepare)
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Copy proto files if needed for gRPC
COPY --from=builder /app/src/grpc/protos ./dist/grpc/protos

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Expose ports (HTTP + gRPC) - UPDATE THESE FOR YOUR SERVICE
# See PORTS.md for available ports
EXPOSE 3000 50051

# Health check - UPDATE PORT FOR YOUR SERVICE
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Use dumb-init as entrypoint for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]
