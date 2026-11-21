# Playground

Static UI for trying document extraction. No build step.

It runs on a mock API in `api.js` (`window.DocApi`), so it works without the backend. Swap that file for real calls once the backend is ready.

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory playground
```

Open http://127.0.0.1:8765. Add `?theme=light|dark` to force a theme, or `?capture` for a clean frame for screenshots.

## Real extractor (optional)

`?api=real` swaps the mock for `api.real.js`, which posts to `server.py`. The server calls `extract_file()` of namichain-file-extractor and reads files with vlm on when `VLLM_URL` and `VLLM_MODEL` are set. Failures come back as `{error_code, error}` (`encrypted`, `damaged`, `scanned`, `failed`) and the UI picks its copy from `error_code`.

```sh
EXTRACTOR_DIR=/path/to/namichain-file-extractor \
  uvicorn server:app --app-dir playground --port 8765
```

Run it in the extractor's Python environment, then open http://127.0.0.1:8765/?api=real. Try `image-only.pdf` in mock mode to see the scanned PDF state.
