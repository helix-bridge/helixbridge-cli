FROM node:20-alpine

COPY . /app

RUN yarn install

ENTRYPOINT ["/app/scripts/helixbridge.sh"]
