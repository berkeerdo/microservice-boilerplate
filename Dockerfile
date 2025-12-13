# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (layer caching)
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Compile knexfile separately (it's outside src/)
RUN npx tsc knexfile.ts --outDir dist --module NodeNext --moduleResolution NodeNext --esModuleInterop true

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

# Copy knexfile (compiled separately, migrations are already in dist/)
COPY --from=builder /app/dist/knexfile.js ./dist/

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Expose ports (HTTP + gRPC)
EXPOSE 3000 50051

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Use dumb-init as entrypoint for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]
