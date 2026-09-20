FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV PORT=8080
ENV CI=true

# DocMark's conversion pipeline uses these native document and OCR tools.
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends \
    antiword \
    binutils \
    ca-certificates \
    libreoffice \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-chi-sim \
    tesseract-ocr-deu \
    tesseract-ocr-fra \
    tesseract-ocr-ita \
    tesseract-ocr-jpn \
    tesseract-ocr-por \
    tesseract-ocr-spa \
    unzip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN corepack enable \
  && corepack prepare pnpm@10.26.1 --activate

COPY . .

RUN pnpm install --frozen-lockfile \
  && pnpm --filter @workspace/api-server run build \
  && pnpm prune --prod

EXPOSE 8080

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]