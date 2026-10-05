import { LEVELS } from './levels';
import type { WorkerRequest, WorkerResponse } from './ort.worker';
import type { BatchOutput, Level, SearchConfig } from './types';

// The networks run in a dedicated worker (see ort.worker.ts): downloading, initialising and evaluating never block the page.
const worker = new Worker(new URL('./ort.worker.ts', import.meta.url), { type: 'module' });

let level: Level = 1;

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

const loads = new Map<Level, Promise<void>>();
const loadWaiters = new Map<Level, { resolve: () => void; reject: (e: Error) => void }>();
const runWaiters = new Map<
  number,
  { resolve: (o: BatchOutput) => void; reject: (e: Error) => void }
>();
let nextId = 1;

worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
  const msg = e.data;
  if (msg.type === 'loaded') {
    setState(msg.level as Level, 'ready');
    loadWaiters.get(msg.level as Level)?.resolve();
    loadWaiters.delete(msg.level as Level);
  } else if (msg.type === 'load-error') {
    loads.delete(msg.level as Level); // allow a retry
    setState(msg.level as Level, 'error');
    loadWaiters.get(msg.level as Level)?.reject(new Error(msg.message));
    loadWaiters.delete(msg.level as Level);
  } else if (msg.type === 'result') {
    runWaiters.get(msg.id)?.resolve({ policy: msg.policy, wdl: msg.wdl });
    runWaiters.delete(msg.id);
  } else {
    runWaiters.get(msg.id)?.reject(new Error(msg.message));
    runWaiters.delete(msg.id);
  }
};

function post(msg: WorkerRequest) {
  worker.postMessage(msg);
}

function load(l: Level): Promise<void> {
  let p = loads.get(l);
  if (!p) {
    setState(l, 'loading');
    p = new Promise<void>((resolve, reject) => loadWaiters.set(l, { resolve, reject }));
    p.catch(() => {}); // the state listener reports failures
    loads.set(l, p);
    post({ type: 'load', level: l, url: new URL(`/models/level${l}.onnx`, location.href).href });
  }
  return p;
}

/** Select the level's model and start loading it so the first move is not slow. */
export function setLevel(l: Level) {
  level = l;
  void load(l);
}

export const currentSearch = (): SearchConfig => LEVELS.find((l) => l.id === level)!.search;

/** Evaluate `n` encoded positions with the current level's model in one call. */
export async function evaluateBatch(features: Float32Array, n: number): Promise<BatchOutput> {
  const l = level;
  await load(l);
  const id = nextId++;
  return new Promise<BatchOutput>((resolve, reject) => {
    runWaiters.set(id, { resolve, reject });
    post({ type: 'run', id, level: l, features, n });
  });
}
