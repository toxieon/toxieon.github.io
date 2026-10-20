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

## Link fetcher (optional, for sites that block the server)

Instagram, TikTok and sometimes YouTube block datacenter IPs. Link mode can go through a proxy or a paid downloader API instead. With none of these set, behaviour is unchanged (`yt-dlp` from the server's own IP). Upload mode never uses any of this.

- `REEL_READER_FETCHER`: which fetcher to use. Default `ytdlp`. Options:
  - `ytdlp`: `yt-dlp` direct (today's behaviour).
  - `ytdlp-proxy`: `yt-dlp --proxy <REEL_READER_PROXY_URL>`.
  - `http-api`: a downloader API that returns a direct media URL as JSON. The file is streamed to disk with the same size and duration limits.
  - A comma-separated list is a **fallback chain**, e.g. `ytdlp,ytdlp-proxy`: try direct first, and use the proxy only when the site **blocks or rate-limits** the request. Validation errors (too long, too large, private, not found) never move on to the next fetcher.
- `REEL_READER_PROXY_URL`: for `ytdlp-proxy`. `http://`, `https://` or `socks5://` only, e.g. `http://<user>:<password>@<proxy-host>:<port>`. It's never logged; error messages show `[hidden]` in its place.
- `REEL_READER_PROXY_HOSTS`: optional comma-separated list of link hosts that use the proxy, e.g. `instagram.com,tiktok.com` (subdomains included). Other hosts go direct. Empty means every host uses the proxy.
- `REEL_READER_API_URL`: for `http-api`. A URL template with a `{url}` placeholder that gets the URL-encoded link, e.g. `https://<downloader-api-host>/v1/fetch?url={url}`. Keep keys out of this URL and use the header below instead.
- `REEL_READER_API_KEY`: the downloader API key (never logged).
- `REEL_READER_API_KEY_HEADER`: the header name for the key. Default `x-api-key`.
- `REEL_READER_API_MEDIA_FIELD`: dot path to the media URL in the API's JSON response. Default `url`; array indexes are allowed, e.g. `data.medias.0.url`.

A bad combination (an unknown fetcher, a missing proxy URL, a `{url}`-less API template) stops the service at boot with a short message. The boot log line shows which fetcher is active, e.g. `fetcher=ytdlp,ytdlp-proxy proxy=set hosts=instagram.com,tiktok.com`, never the values.

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
