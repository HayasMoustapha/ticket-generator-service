# Ticket Generator Service - Dockerfile
FROM node:20-alpine

# Install required packages for PDF and image processing
RUN apk add --no-cache curl fontconfig ttf-dejavu

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create storage directory
RUN mkdir -p /app/storage

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 3004

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3004/health || exit 1

# Start application
CMD ["node", "src/server.js"]
