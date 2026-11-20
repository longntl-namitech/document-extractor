"""Dev-only server for the playground UI. Not part of the service.

Takes an uploaded file and calls extractor.extract_file() directly, the same path
tests/smoke_local.py uses. That skips validate_url() and download_file(), so it
proves nothing about the SSRF guard or the 50 MB download limit.

Run inside Docker from the repo root (--app-dir because the folder name has a dash):
  docker run --rm -p 8765:8765 -v $PWD:/app nfe-test:local \
    uvicorn server:app --app-dir dev/playground-ui --host 0.0.0.0 --port 8765
"""
import os
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

import extractor

app = FastAPI()


@app.post("/api/extract")
def extract(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "")[1]
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        while chunk := file.file.read(1024 * 1024):
            tmp.write(chunk)
        path = tmp.name
    started = time.perf_counter()
    try:
        result = extractor.extract_file(path, "http://local/" + (file.filename or "upload"))
        return {**result, "ms": round((time.perf_counter() - started) * 1000)}
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    finally:
        os.unlink(path)


app.mount("/", StaticFiles(directory=HERE, html=True), name="ui")
