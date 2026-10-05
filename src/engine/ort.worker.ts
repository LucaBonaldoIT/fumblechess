/// <reference lib="webworker" />
// Runs the ONNX models off the main thread so the page stays responsive during a search.
// (onnxruntime-web's own `proxy` option re-loads the bundled app script as a worker, which breaks once Vite has
// bundled the app, so we run the runtime inside a worker of our own.)
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { N_FEATURES } from './encoding';

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = { wasm: wasmUrl };

export type WorkerRequest =
  | { type: 'load'; level: number; url: string }
  | { type: 'run'; id: number; level: number; features: Float32Array; n: number };

export type WorkerResponse =
  | { type: 'loaded'; level: number }
  | { type: 'load-error'; level: number; message: string }
  | { type: 'result'; id: number; policy: Float32Array; wdl: Float32Array }
  | { type: 'error'; id: number; message: string };

const sessions = new Map<number, Promise<ort.InferenceSession>>();
// ORT sessions reject overlapping run() calls, so serialise inference
let queue: Promise<unknown> = Promise.resolve();

const reply = (msg: WorkerResponse) => self.postMessage(msg);

function load(level: number, url: string) {
  let s = sessions.get(level);
  if (!s) {
    s = ort.InferenceSession.create(url, { executionProviders: ['wasm'] });
    s.catch(() => sessions.delete(level)); // allow a retry after a failed download
    sessions.set(level, s);
  }
  return s;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === 'load') {
    load(msg.level, msg.url).then(
      () => reply({ type: 'loaded', level: msg.level }),
      (err) =>
        reply({ type: 'load-error', level: msg.level, message: String(err?.message ?? err) }),
    );
    return;
  }
  const job = queue.then(async () => {
    const sess = await sessions.get(msg.level);
    if (!sess) throw new Error(`model for level ${msg.level} is not loaded`);
    const out = await sess.run({
      board: new ort.Tensor('float32', msg.features, [msg.n, 64, N_FEATURES]),
    });
    const v = out.value.data as Float32Array;
    const wdl = new Float32Array(msg.n * 3);
    for (let i = 0; i < msg.n; i++) {
      const m = Math.max(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
      const e0 = Math.exp(v[i * 3] - m);
      const e1 = Math.exp(v[i * 3 + 1] - m);
      const e2 = Math.exp(v[i * 3 + 2] - m);
      const t = e0 + e1 + e2;
      wdl[i * 3] = e0 / t;
      wdl[i * 3 + 1] = e1 / t;
      wdl[i * 3 + 2] = e2 / t;
    }
    const policy = (out.policy.data as Float32Array).slice();
    reply({ type: 'result', id: msg.id, policy, wdl });
  });
  queue = job.catch((err) =>
    reply({ type: 'error', id: msg.id, message: String(err?.message ?? err) }),
  );
};
