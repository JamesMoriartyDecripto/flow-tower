# Whisper in the browser (transformers.js)

## How it works

transformers.js (4.3.1) runs a Whisper ONNX model inside the page, on WebGPU (`device: 'webgpu'`) or on WASM.
The model files download once and stay in the Cache API (`transformers-cache`; `env.useBrowserCache` is on by default).
Audio never leaves the page. The Whisper encoder is sensitive to quantization, so the dtype choice matters.

## At a glance

| | |
|---|---|
| Browsers | Any with WASM. WebGPU in Firefox: Windows 141+, Apple-silicon Macs 145/147+; not Intel Macs, not Linux |
| Where audio goes | Stays in the page |
| First-use cost | Download: tiny q8 ~41 MB, base q8 ~77 MB, base q4 ~142 MB, large-v3-turbo q4f16 ~564 MB |
| Latency | Reported 5-8x real time for base on WebGPU (hardware not stated, unverified). WASM is slower; not measured |
| Cost per command | None |

## Why chosen / why not

Not now: the first use downloads tens of MB (~77 MB for whisper-base q8) before the first command works.
Firefox on an Intel Mac has no WebGPU, so it falls back to WASM and each command is slower.
Kept as the offline option: fully local, no key, no account.

## Sources

Checked 2026-10-10.

- https://registry.npmjs.org/@huggingface/transformers
- https://huggingface.co/docs/transformers.js/guides/webgpu
- https://huggingface.co/docs/transformers.js/guides/dtypes
- https://huggingface.co/onnx-community/whisper-base/tree/main/onnx (file sizes)
- https://developer.mozilla.org/en-US/docs/Web/API/GPU
- https://offlinetts.com/blog/browser-speech-recognition-whisper-comparison/ (latency, unverified)
