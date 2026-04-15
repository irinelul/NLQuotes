# Use Node.js LTS version
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application
COPY . .

# Accept build arguments for Vite environment variables
ARG VITE_GRAFANA_DASHBOARD_URL
ARG VITE_GRAFANA_DASHBOARD_URL_MOBILE
ARG TENANT_ID=northernlion

# Set them as environment variables for the build
ENV VITE_GRAFANA_DASHBOARD_URL=$VITE_GRAFANA_DASHBOARD_URL
ENV VITE_GRAFANA_DASHBOARD_URL_MOBILE=$VITE_GRAFANA_DASHBOARD_URL_MOBILE
ENV TENANT_ID=$TENANT_ID

# Skip static topic generation during Docker build — no network access to umami at build time.
# The entrypoint script runs it at container startup when the network is available.
ENV SKIP_STATIC_TOPICS=true

# Build the application (Vite will pick up the env vars)
RUN npm run build

# Accept PORT from Coolify (or default to 8080)
ARG PORT=8080
ENV PORT=${PORT}
ENV NODE_ENV=production
ENV DATABASE_URL=${DATABASE_URL}

# Expose the port (must match PORT)
EXPOSE ${PORT}

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

CMD ["/app/docker-entrypoint.sh"]
