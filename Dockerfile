FROM node:22-bookworm-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=5000 HOST=127.0.0.1 RAG_INDEX_DIR=/app/vectra_index
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY index.js db.js llm.js groqClient.js ./
COPY models/ ./models/
COPY routes/ ./routes/
COPY providers/ ./providers/
COPY utils/ ./utils/
COPY data/ ./data/
COPY --from=frontend /src/build ./build
RUN mkdir -p /app/vectra_index && chown node:node /app/vectra_index
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 CMD node -e "fetch('http://127.0.0.1:5000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "index.js"]
