FROM node:20-alpine

COPY . /app

RUN yarn install

CMD ["npx", "zx", "/app/src/index.mjs"]
