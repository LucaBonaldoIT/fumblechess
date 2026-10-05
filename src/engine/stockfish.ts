import jsUrl from 'stockfish/bin/stockfish-19-lite-single.js?url';
import wasmUrl from 'stockfish/bin/stockfish-19-lite-single.wasm?url';

/** Engine score from White's point of view: centipawns, or moves to mate (negative = Black mates). */
export interface SfScore {
  cp?: number;
  mate?: number;
}

const MOVE_TIME_MS = 300;

interface Job {
  fen: string;
  resolve: (s: SfScore | null) => void;
}

let worker: Worker | undefined;
let ready: Promise<void> | undefined;
let running: (Job & { score: SfScore | null; stopped: boolean }) | null = null;
let pending: Job | null = null;

function start(): Promise<void> {
  if (ready) return ready;
  // the engine reads its .wasm location from the worker URL hash
  worker = new Worker(`${jsUrl}#${encodeURIComponent(wasmUrl)}`);
  ready = new Promise<void>((resolve, reject) => {
    const w = worker!;
    w.onerror = (e) => reject(e);
    w.onmessage = (e: MessageEvent<string>) => {
      const line = String(e.data);
      if (line === 'uciok') w.postMessage('isready');
      else if (line === 'readyok') {
        w.onmessage = onLine;
        resolve();
      }
    };
    w.postMessage('uci');
  }).catch((err) => {
    ready = undefined; // allow a retry
    throw err;
  });
  return ready;
}

function onLine(e: MessageEvent<string>) {
  const line = String(e.data);
  if (!running) return;
  if (line.startsWith('info ') && line.includes(' score ')) {
    const m = / score (cp|mate) (-?\d+)/.exec(line);
    if (m && !/ (lowerbound|upperbound)/.test(line)) {
      const v = Number(m[2]);
      // UCI scores are from the side to move; flip to White's view
      const sign = running.fen.split(' ')[1] === 'w' ? 1 : -1;
      running.score = m[1] === 'cp' ? { cp: v * sign } : { mate: v * sign };
    }
  } else if (line.startsWith('bestmove')) {
    const done = running;
    running = null;
    done.resolve(done.stopped ? null : done.score);
    if (pending) run(pending);
  }
}

function run(job: Job) {
  pending = null;
  running = { ...job, score: null, stopped: false };
  worker!.postMessage(`position fen ${job.fen}`);
  worker!.postMessage(`go movetime ${MOVE_TIME_MS}`);
}

/**
 * Evaluate a position. A newer call supersedes an older one: the older promise resolves null.
 */
export async function analyse(fen: string): Promise<SfScore | null> {
  await start();
  return new Promise((resolve) => {
    if (pending) pending.resolve(null);
    const job: Job = { fen, resolve };
    if (running) {
      pending = job;
      running.stopped = true;
      worker!.postMessage('stop');
    } else {
      run(job);
    }
  });
}
