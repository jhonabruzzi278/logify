FROM node:22-alpine
RUN apk add --no-cache wget
WORKDIR /app
COPY shipping-service/package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY shipping-service/src/ ./src/
COPY shared/ ./shared/
EXPOSE 8084
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://localhost:8084/health || exit 1
USER node
CMD ["node", "src/index.js"]
