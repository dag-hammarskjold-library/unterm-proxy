FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:3000/unterm/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

USER node

CMD ["node", "server.mjs"]
