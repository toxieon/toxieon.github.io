"""Thin HTTP API for the Neill Data ICO generator.

Run (from the repo root):
    uvicorn ico.server:app --host 127.0.0.1 --port 8765
or:
    python ico/server.py            # same thing, port 8765 (override with ICO_PORT)

Endpoints:
    GET /health                                  -> {"status": "ok", "version": "..."}
    GET /ico?name=TipBot&version=0.45.1          -> image/x-icon download (TipBot-0.45.1.ico)
        optional: bg=#0B1F3A  fg=#FFFFFF  short=TB  sizes=16,32,48,256
"""
from __future__ import annotations

import os
import sys

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response

try:  # package import (uvicorn ico.server:app / python -m ico.server)
    from . import generate as gen
except ImportError:  # direct script run (python ico/server.py)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import generate as gen  # type: ignore[no-redef]

app = FastAPI(title="Neill Data ICO generator", version=gen.VERSION, docs_url="/docs", redoc_url=None)


@app.get("/health")
def health():
    return {"status": "ok", "version": gen.VERSION}


@app.get("/ico", response_class=Response, responses={200: {"content": {"image/x-icon": {}}}})
def ico(
    name: str = Query(..., max_length=gen.MAX_NAME, description="Line 1, e.g. TipBot"),
    version: str = Query(..., max_length=gen.MAX_VERSION, description="Line 2, e.g. 0.45.1"),
    bg: str | None = Query(None, max_length=7, description="Background hex, default #0B1F3A"),
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
    filename = gen.safe_filename(clean_name, clean_ver)
    return Response(
        content=data,
        media_type="image/x-icon",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=os.environ.get("ICO_HOST", "127.0.0.1"), port=int(os.environ.get("ICO_PORT", "8765")))
