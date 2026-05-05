# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (incorporating cache)
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build the frontend (Vite)
# This will output to /app/dist
RUN npm run build

# Stage 2: Production Runner
FROM node:20-alpine

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy built frontend assets
COPY --from=builder /app/dist ./dist

# Copy backend source code
COPY --from=builder /app/server ./server

# Create uploads directory
RUN mkdir -p server/uploads

# Expose the application port
EXPOSE 3005

# Start the server directly (bypassing nodemon)
CMD ["node", "server/index.js"]
