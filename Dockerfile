FROM ghcr.io/foundry-rs/foundry:nightly as foundry

FROM node:21-alpine

COPY --from=foundry /usr/local/bin/cast /usr/local/bin/

COPY . /app
RUN npm config set update-notifier false \
    && cd /app \
    && yarn install

ENTRYPOINT ["/app/scripts/helixbridge.sh"]
