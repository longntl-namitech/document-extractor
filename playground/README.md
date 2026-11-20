# Playground

Static UI for trying document extraction. No build step.

It runs on a mock API in `api.js` (`window.DocApi`), so it works without the backend. Swap that file for real calls once the backend is ready.

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory playground
```

Open http://127.0.0.1:8765. Add `?theme=light|dark` to force a theme, or `?capture` for a clean frame for screenshots.
