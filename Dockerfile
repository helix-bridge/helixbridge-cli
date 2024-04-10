FROM node:20-alpine

COPY . /app

RUN yarn install

ENDPOINT ["/app/scripts/helixbridge.sh"]
