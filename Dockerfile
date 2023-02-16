FROM node as builder

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM node:slim

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./

RUN npm ci --production

COPY --from=builder /usr/src/app/out ./out

ENV V2_MAINNET_ENDPOINT http://v2-mainnet:8081
ENV V2_TESTNET_ENDPOINT http://v2-testnet:8081

ENV V4_MAINNET_ENDPOINT http://v4-mainnet:3000
ENV V4_TESTNET_ENDPOINT http://v4-testnet:3000

EXPOSE 3000
CMD [ "node", "out/index.js" ]