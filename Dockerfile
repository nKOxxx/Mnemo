FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy app
COPY server.js crypto.js index.js briefing.js ./
COPY memory-graph.js memory-templates.js import-export.js agent-collaboration.js agent-profiles.js ./
COPY public/ public/

# Create data directory
RUN mkdir -p /root/.cognexia/data-lake

# Expose port
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:10000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start server
CMD ["node", "server.js"]
