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

ENV V2_MAINNET_ENDPOINT http://v2-mainnet:8081/jsonRPC

EXPOSE 3000
CMD [ "node", "out/index.js" ]