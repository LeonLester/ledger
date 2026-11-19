// Copies the MediaPipe WASM runtime from node_modules into public/mediapipe so pose tracking runs offline. The folder is git ignored.
import { cpSync, mkdirSync } from "node:fs";
mkdirSync("public/mediapipe", { recursive: true });
for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) cpSync(`node_modules/@mediapipe/tasks-vision/wasm/${f}`, `public/mediapipe/${f}`);
