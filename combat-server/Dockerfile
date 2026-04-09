# docker build -f combat-server/Dockerfile .
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared shared
COPY login-server login-server
COPY gateway gateway
COPY world-server world-server
COPY combat-server combat-server
RUN npm ci
RUN npm run build -w @myth-of-rune/shared -w combat-server
WORKDIR /app/combat-server
CMD ["node", "dist/index.js"]
