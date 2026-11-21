# Playground

Static UI for trying document extraction. No build step.

It runs on the real extractor by default: `api.real.js` (`window.DocApi`) posts files to `server.py`, which calls `extract_file()` of namichain-file-extractor and reads files with vlm on when `VLLM_URL` and `VLLM_MODEL` are set. Failures come back as `{error_code, error}` (`encrypted`, `damaged`, `scanned`, `failed`) and the UI picks its copy from `error_code`.

```sh
EXTRACTOR_DIR=/path/to/namichain-file-extractor \
  uvicorn server:app --app-dir playground --port 8765
```

Run it in the extractor's Python environment, then open http://127.0.0.1:8765. Add `?theme=light|dark` to force a theme, or `?capture` for a clean frame for screenshots.

## Mock API

`?api=mock` loads the mock in `api.js` instead. It needs no backend, so a plain static server is enough:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory playground
```

Open http://127.0.0.1:8765/?api=mock. Try `image-only.pdf` to see the scanned PDF state.
