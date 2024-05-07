# Stage 1: Build the application
FROM --platform=linux/amd64 node AS builder

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to install dependencies
COPY package*.json ./

# Install app dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Create the production image
FROM --platform=linux/amd64 node:slim

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to install dependencies
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy the built application from the builder stage
COPY --from=builder /usr/src/app/out ./out

# Set environment variables
ENV V2_MAINNET_ENDPOINT http://v2-mainnet:8081
ENV V2_TESTNET_ENDPOINT http://v2-testnet:8081
ENV V4_MAINNET_ENDPOINT http://v4-mainnet:3000
ENV V4_TESTNET_ENDPOINT http://v4-testnet:3000

# Expose the port
EXPOSE 3000

# Command to run the application
CMD [ "node", "out/index.js" ]
