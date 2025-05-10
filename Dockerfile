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
ENV PORT=3002
ENV NODE_ENV=production

# Expose the port
EXPOSE 3002

# Start the server
CMD ["node", "server.js"] 