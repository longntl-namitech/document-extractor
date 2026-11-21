"""Dev-only server for the playground UI. Not part of the service.

Takes an uploaded file and calls extractor.extract_file() of namichain-file-extractor
directly, the same path tests/smoke_local.py uses. That skips validate_url() and
download_file(), so it proves nothing about the SSRF guard or the 50 MB download limit.

Files are read with vlm on when the extractor has VLLM_URL and VLLM_MODEL set, so a
scanned PDF is read instead of rejected. Failures return {"error_code", "error"}:
the UI shows copy by error_code and never parses the message.

Run in the namichain-file-extractor environment (Docker or its venv) from this repo's root:
  EXTRACTOR_DIR=/path/to/namichain-file-extractor \
    uvicorn server:app --app-dir playground --port 8765
Then open http://127.0.0.1:8765/?api=real
"""
import os
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.environ["EXTRACTOR_DIR"])

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

import extractor
from errors import error_code

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
        result = extractor.extract_file(
            path, "http://local/" + (file.filename or "upload"), vlm=extractor._VLM_CFG is not None)
        return {**result, "ms": round((time.perf_counter() - started) * 1000)}
    except Exception as e:
        return JSONResponse(status_code=400, content={"error_code": error_code(e), "error": str(e)})
    finally:
        os.unlink(path)


app.mount("/", StaticFiles(directory=HERE, html=True), name="ui")
