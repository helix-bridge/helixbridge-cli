FROM ghcr.io/foundry-rs/foundry:nightly AS foundry

FROM node:21-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=foundry /usr/local/bin/cast /usr/local/bin/

COPY . /app
RUN npm config set update-notifier false \
    && npm i -g zx \
    && cd /app \
    && npm i

ENTRYPOINT ["/app/scripts/helixbridge.sh"]
