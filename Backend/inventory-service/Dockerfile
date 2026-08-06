FROM node:22-alpine
RUN apk add --no-cache wget
WORKDIR /app
COPY inventory-service/package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY inventory-service/src/ ./src/
COPY shared/ ./shared/
EXPOSE 8082
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://localhost:8082/health || exit 1
USER node
CMD ["node", "src/index.js"]
