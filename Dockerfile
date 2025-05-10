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

# Set them as environment variables for the build
ENV VITE_GRAFANA_DASHBOARD_URL=$VITE_GRAFANA_DASHBOARD_URL
ENV VITE_GRAFANA_DASHBOARD_URL_MOBILE=$VITE_GRAFANA_DASHBOARD_URL_MOBILE

# Build the application (Vite will pick up the env vars)
RUN npm run build

# Set environment variables for backend (if needed)
ENV PORT=8080
ENV NODE_ENV=production
ENV DATABASE_URL=${DATABASE_URL}

# Expose the port
EXPOSE 8080

# Start the server with proper error handling
CMD ["node", "--trace-warnings", "index.js"]
