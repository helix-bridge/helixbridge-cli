FROM node:20-alpine

COPY . /app

RUN cd /app && yarn install

ENTRYPOINT ["/app/scripts/helixbridge.sh"]
