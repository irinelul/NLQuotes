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

# Build the application
RUN npm run build

# Set environment variables
ENV PORT=8080
ENV NODE_ENV=production
ENV DATABASE_URL=${DATABASE_URL}

# Expose the port
EXPOSE 8080

# Start the server with proper error handling
CMD ["node", "--trace-warnings", "index.js"]
