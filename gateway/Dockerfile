# docker build -f gateway/Dockerfile .
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared shared
COPY login-server login-server
COPY gateway gateway
COPY world-server world-server
COPY combat-server combat-server
RUN npm ci
RUN npm run build -w gateway
WORKDIR /app/gateway
CMD ["node", "dist/index.js"]
