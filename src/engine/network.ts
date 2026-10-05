import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { N_FEATURES } from './encoding';
import { LEVELS } from './levels';
import type { BatchOutput, Level, SearchConfig } from './types';

ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = true; // run the model in a worker so the page stays responsive during search
ort.env.wasm.wasmPaths = { wasm: wasmUrl };

let level: Level = 1;
const sessions = new Map<Level, Promise<ort.InferenceSession>>();

export type ModelState = 'loading' | 'ready' | 'error';
const states = new Map<Level, ModelState>();
const listeners = new Set<() => void>();

/** Download/initialisation state of a level's model; undefined until it is first requested. */
export const modelState = (l: Level): ModelState | undefined => states.get(l);

/** Call `fn` whenever any model starts loading, becomes ready or fails. */
export function onModelStateChange(fn: () => void) {
  listeners.add(fn);
}

function setState(l: Level, state: ModelState) {
  states.set(l, state);
  listeners.forEach((fn) => fn());
}

function getSession(l: Level) {
  let s = sessions.get(l);
  if (!s) {
    setState(l, 'loading');
    s = ort.InferenceSession.create(`/models/level${l}.onnx`, { executionProviders: ['wasm'] });
    s.then(
      () => setState(l, 'ready'),
      () => {
        sessions.delete(l); // allow a retry if loading failed
        setState(l, 'error');
      },
    );
    sessions.set(l, s);
  }
  return s;
}

/** Select the level's model and start loading it so the first move is not slow. */
export function setLevel(l: Level) {
  level = l;
  void getSession(l).catch(() => {});
}

export const currentSearch = (): SearchConfig => LEVELS.find((l) => l.id === level)!.search;

// ORT sessions reject overlapping run() calls, so serialize inference.
let queue: Promise<unknown> = Promise.resolve();

/** Evaluate `n` encoded positions with the current level's model in one call. */
export function evaluateBatch(features: Float32Array, n: number): Promise<BatchOutput> {
  const job = queue.then(async () => {
    const sess = await getSession(level);
    const out = await sess.run({ board: new ort.Tensor('float32', features, [n, 64, N_FEATURES]) });
    const v = out.value.data as Float32Array;
    const wdl = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const m = Math.max(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
      const e0 = Math.exp(v[i * 3] - m);
      const e1 = Math.exp(v[i * 3 + 1] - m);
      const e2 = Math.exp(v[i * 3 + 2] - m);
      const t = e0 + e1 + e2;
      wdl[i * 3] = e0 / t;
      wdl[i * 3 + 1] = e1 / t;
      wdl[i * 3 + 2] = e2 / t;
    }
    return { policy: out.policy.data as Float32Array, wdl };
  });
  queue = job.catch(() => undefined);
  return job;
}
