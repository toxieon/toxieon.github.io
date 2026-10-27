FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# ffmpeg comes from Debian (separate program, called via subprocess only).
# python3 runs yt-dlp; curl fetches it and is removed afterwards.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# yt-dlp (Unlicense): official platform-independent release binary, pinned to a
# version tag. The pinned SHA-256 must match both the download and the
# release's SHA2-256SUMS, or the build fails.
ARG YTDLP_VERSION=2026.08.19
ARG YTDLP_SHA256=1fa6733c37ea6fb51c99ad8fe785e7b7e5f3246c9b980230329d4fb72ed8d4d6
RUN set -eu; base="https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}"; \
  curl -fsSL -o /tmp/yt-dlp "$base/yt-dlp"; \
  curl -fsSL -o /tmp/SHA2-256SUMS "$base/SHA2-256SUMS"; \
  grep -qx "${YTDLP_SHA256}  yt-dlp" /tmp/SHA2-256SUMS; \
  echo "${YTDLP_SHA256}  /tmp/yt-dlp" | sha256sum -c -; \
  install -m 0755 /tmp/yt-dlp /usr/local/bin/yt-dlp; \
  rm -f /tmp/yt-dlp /tmp/SHA2-256SUMS; \
  yt-dlp --version

# Deno (MIT): JavaScript runtime yt-dlp needs for YouTube. Pinned to the
# version yt-dlp 2026.08.19 pins, with the release's published SHA-256.
ARG DENO_VERSION=v2.9.5
ARG DENO_SHA256=8b010a3b1a4a0188a67cdb8a7a27348b2a501af78aec7fc74f2ace167368d530
RUN set -eu; \
  curl -fsSL -o /tmp/deno.zip "https://github.com/denoland/deno/releases/download/${DENO_VERSION}/deno-x86_64-unknown-linux-gnu.zip"; \
  echo "${DENO_SHA256}  /tmp/deno.zip" | sha256sum -c -; \
  python3 -c "import zipfile; zipfile.ZipFile('/tmp/deno.zip').extract('deno', '/usr/local/bin')"; \
  chmod 0755 /usr/local/bin/deno; \
  rm -f /tmp/deno.zip; \
  apt-get purge -y --auto-remove curl; \
  deno --version; \
  yt-dlp --version

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/index.cjs"]
