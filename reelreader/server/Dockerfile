FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# yt-dlp (Unlicense) for downloading media. ffmpeg is called as a separate
# executable via subprocess only when transcoding is needed.
RUN apt-get update \
  && apt-get install -y --no-install-recommends yt-dlp ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/index.cjs"]
