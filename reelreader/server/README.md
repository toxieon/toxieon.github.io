# Reel Reader backend (Render)

Small Node service for `POST /api/reel-reader` and `POST /api/reel-reader/upload` used by the static app in `/reelreader`.

## Endpoints

- `POST /api/reel-reader`
- Header: `x-reel-reader-key: <REEL_READER_KEY>`
- Body: `{"url":"https://..."}` (Instagram/TikTok/YouTube only)
- Success response:
  ```json
  {
    "prompt": "...",
    "transcript": "...",
    "caption": "...",
    "steps": ["..."],
    "recipe": null
  }
  ```

- `POST /api/reel-reader/upload`
  - Multipart field `video`, one file, video/* only, max 100 MB (enforced while streaming to disk; 413 `file_too_large` otherwise).
- Header: `x-reel-reader-key: <REEL_READER_KEY>`
- Body: `multipart/form-data` with field `video` (streamed to disk; video MIME types only)
- Same success JSON as the link endpoint

## Required environment variables

- `GEMINI_API_KEY` – Gemini API key.
- `REEL_READER_KEY` – shared key required by `x-reel-reader-key`.

- `GET /api/reel-reader/download/<token>` — one-time stream of the fetched link video (requires `x-reel-reader-key`; token from link-mode JSON `downloadToken`, expires in 10 minutes)

Errors come back as `{"error":{"code","message"}}` with a short message (codes include `source_blocked`, `source_private`, `source_unavailable`, `file_too_large`, `unsupported_type`, `video_too_long`, `model_busy`, `timeout`, `convert_failed`, `model_failed`, `processing_failed`). The raw yt-dlp output is only written to the service log.

## Optional environment variables

- `IG_COOKIES` – Netscape cookies file text for a throwaway Instagram account.
- `GEMINI_MODEL` – defaults to `gemini-3.5-flash`.
- `REEL_READER_TIMEOUT_MS` – total request timeout (default `180000`).
- `REEL_READER_COMMAND_TIMEOUT_MS` – per subprocess timeout (default `120000`).
- `REEL_READER_MAX_DURATION_SEC` – max source duration (default `300`).
- `REEL_READER_MAX_BYTES` – max downloaded bytes (default `125829120`).
- `PORT` – defaults to `8080`.

## Render deploy steps

1. Create a new **Web Service** in Render from this repository.
2. Root directory: `reelreader/server`.
3. Environment: **Docker**.
4. Add env vars listed above (`GEMINI_API_KEY`, `REEL_READER_KEY` required).
5. Deploy.
6. Copy the public service URL and set `backendUrl` in `/reelreader/config.js`.

## Local run

```bash
cd reelreader/server
npm install
GEMINI_API_KEY=... REEL_READER_KEY=... npm start
```
