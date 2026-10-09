# Studio orchestrator image. Agents run in-process via the Claude Agent SDK.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git openssh-client python3 python3-numpy \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
USER node
CMD ["npx", "tsx", "src/main.ts"]
