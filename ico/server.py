"""Thin HTTP API for the Neill Data ICO generator.

Run (from the repo root):
    uvicorn ico.server:app --host 127.0.0.1 --port 8765
or:
    python ico/server.py            # same thing, port 8765 (override with ICO_PORT)

Endpoints:
    GET /health                                  -> {"status": "ok", "version": "..."}
    GET /ico?name=TipBot&version=0.45.1          -> image/x-icon download (TipBot-0.45.1.ico)
        optional: bg=#0B1F3A | bg=transparent | bg=none   fg=#FFFFFF  short=TB  sizes=16,32,48,256
        (bg omitted -> Neill navy; bg=, bg=transparent, bg=none -> transparent with outlined text)
    POST /ico   multipart/form-data, file field `image` (or `file`), optional `sizes`
                -> image/x-icon download (<upload-name>.ico). PNG / JPEG / WebP / ICO, max 10 MB,
                   max 40 million pixels. Alpha is kept; nothing is painted behind it.

CORS: browsers on https://www.neilldata.com and http://localhost / 127.0.0.1 (any port) may call
the API (so the /ico/ page's "Download via API" can read the response). Override with
ICO_CORS_ORIGINS="https://a.example,https://b.example" (or "*").
"""
from __future__ import annotations

import os
import sys

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

try:  # package import (uvicorn ico.server:app / python -m ico.server)
    from . import generate as gen
except ImportError:  # direct script run (python ico/server.py)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import generate as gen  # type: ignore[no-redef]

app = FastAPI(title="Neill Data ICO generator", version=gen.VERSION, docs_url="/docs", redoc_url=None)

_cors = os.environ.get("ICO_CORS_ORIGINS", "").strip()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors.split(",") if o.strip()] if _cors else [],
    allow_origin_regex=None if _cors else r"https://(www\.)?neilldata\.com|http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


def _ico_response(data: bytes, filename: str) -> Response:
    return Response(
        content=data,
        media_type="image/x-icon",
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"},
    )


@app.get("/health")
def health():
    return {"status": "ok", "version": gen.VERSION}


@app.get("/ico", response_class=Response, responses={200: {"content": {"image/x-icon": {}}}})
def ico(
    name: str = Query(..., max_length=gen.MAX_NAME, description="Line 1, e.g. TipBot"),
    version: str = Query(..., max_length=gen.MAX_VERSION, description="Line 2, e.g. 0.45.1"),
    bg: str | None = Query(None, max_length=16,
                           description="Background hex (default #0B1F3A), or 'transparent' / 'none' / empty for alpha"),
    fg: str | None = Query(None, max_length=7, description="Text hex, default #FFFFFF"),
    short: str | None = Query(None, max_length=gen.MAX_SHORT, description="Text for 16px (default: initials)"),
    sizes: str | None = Query(None, max_length=60, description="Comma list, default 16,32,48,256"),
):
    try:
        size_list = [int(s) for s in sizes.split(",") if s.strip()] if sizes else None
        data = gen.generate_ico(name, version, short=short, bg=bg, fg=fg, sizes=size_list)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    clean_name = gen.clean_text(name, "name", gen.MAX_NAME)
    clean_ver = gen.clean_text(version, "version", gen.MAX_VERSION)
    return _ico_response(data, gen.safe_filename(clean_name, clean_ver))


async def _read_limited(upload: UploadFile) -> bytes:
    data = await upload.read(gen.MAX_UPLOAD_BYTES + 1)
    if len(data) > gen.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"image is larger than {gen.MAX_UPLOAD_BYTES // (1024 * 1024)} MB")
    return data


@app.post("/ico", response_class=Response, responses={200: {"content": {"image/x-icon": {}}}})
async def ico_from_image(
    image: UploadFile | None = File(None, description="PNG, JPEG, WebP or ICO (max 10 MB)"),
    file: UploadFile | None = File(None, description="Alias for `image`"),
    sizes: str | None = Form(None, max_length=60, description="Comma list, default 16,32,48,256"),
):
    upload = image or file
    if upload is None:
        raise HTTPException(status_code=400, detail="send the picture as multipart field `image` (or `file`)")
    data = await _read_limited(upload)
    try:
        ico_bytes = gen.image_to_ico(data, sizes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _ico_response(ico_bytes, gen.image_filename(upload.filename))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=os.environ.get("ICO_HOST", "127.0.0.1"), port=int(os.environ.get("ICO_PORT", "8765")))
