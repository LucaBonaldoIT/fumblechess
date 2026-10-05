import type { Api } from '@lichess-org/chessground/api';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import type { RootStat, SearchResult } from '../engine/mcts';
import type { Wdl } from '../engine/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (p: number) => (p < 0.01 ? '<1%' : `${Math.round(p * 100)}%`);
const ROWS = 5;

let root: HTMLElement;
let built = false;

const IDLE = `
  <div class="t-head"><span class="t-title">AI thoughts</span></div>
  <p class="t-empty">The AI's search appears here on its turn.</p>`;

export function initThoughts(el: HTMLElement) {
  root = el;
  root.innerHTML = IDLE;
}

export function resetThoughts(cg: Api) {
  cg.setAutoShapes([]);
  root.innerHTML = IDLE;
  built = false;
}

export function showScanning() {
  built = false;
  root.innerHTML = `
    <div class="t-head"><span class="t-title">AI thoughts</span><span class="t-live">searching<span class="dots"></span></span></div>
    <div class="t-rows">${'<div class="cand scan"><span class="rank"></span><span class="san"></span><span class="bar"><i></i></span><span class="pc"></span><span class="q"></span></div>'.repeat(ROWS)}</div>`;
}

function build(wdl: Wdl) {
  const [w, d, l] = wdl;
  root.innerHTML = `
    <div class="t-head"><span class="t-title">AI thoughts</span><span class="t-live" id="t-status"></span></div>
    <div class="t-wdl show" title="Value head's first impression of the position: White win / draw / Black win">
      <i class="w" style="--v:${w}"><b>${pct(w)}</b></i><i class="d" style="--v:${d}"></i><i class="l" style="--v:${l}"><b>${pct(l)}</b></i>
    </div>
    <div class="t-rows">${'<div class="cand"><span class="rank"></span><span class="san"></span><span class="bar"><i></i></span><span class="pc"></span><span class="q"></span></div>'.repeat(ROWS)}</div>`;
  built = true;
}

/** The rows to show: top moves by visits, plus the chosen move if it is outside them. */
function visible(stats: RootStat[], pick: number | null): { stat: RootStat; index: number }[] {
  const rows = stats.slice(0, ROWS).map((stat, index) => ({ stat, index }));
  if (pick !== null && pick >= ROWS) rows[ROWS - 1] = { stat: stats[pick], index: pick };
  return rows;
}

function paint(cg: Api, stats: RootStat[], sims: number, pick: number | null) {
  const rows = visible(stats, pick);
  const totalVisits = Math.max(
    1,
    stats.reduce((a, s) => a + s.visits, 0),
  );
  const maxVisits = Math.max(1, ...rows.map((r) => r.stat.visits));
  const els = [...root.querySelectorAll<HTMLElement>('.cand')];
  els.forEach((el, i) => {
    const r = rows[i];
    if (!r || r.stat.visits === 0) {
      el.classList.remove('show');
      return;
    }
    const s = r.stat;
    el.style.setProperty('--p', String(s.visits / maxVisits));
    el.title = `Prior ${pct(s.prior)} before searching · ${s.visits} visits${s.q !== null ? ` · expected score ${Math.round(s.q * 100)}%` : ''}`;
    el.querySelector('.rank')!.textContent = String(r.index + 1);
    el.querySelector('.san')!.textContent = s.san;
    el.querySelector('.pc')!.textContent = pct(s.visits / totalVisits);
    el.querySelector('.q')!.textContent = s.q !== null ? `${Math.round(s.q * 100)}` : '';
    el.classList.add('show');
  });
  const status = root.querySelector('#t-status');
  if (status) status.textContent = `${sims} simulations`;

  const shapes: DrawShape[] = rows
    .filter((r) => r.stat.visits > 0)
    .map((r) => ({
      orig: r.stat.from as Key,
      dest: r.stat.to as Key,
      brush: 'cand',
      modifiers: { lineWidth: 4 + (r.stat.visits / totalVisits) * 12 },
    }));
  cg.setAutoShapes(shapes);
}

/** Called repeatedly while the search runs. */
export function liveThoughts(cg: Api, stats: RootStat[], sims: number, wdl: Wdl) {
  if (!built) build(wdl);
  paint(cg, stats, sims, null);
}

/** Final state: show the move the AI commits to. Resolves false if aborted. */
export async function commitThoughts(
  cg: Api,
  res: SearchResult,
  aborted: () => boolean,
): Promise<boolean> {
  if (!built) build(res.wdl);
  paint(cg, res.stats, res.sims, res.pick);
  const rows = visible(res.stats, res.pick);
  const els = [...root.querySelectorAll<HTMLElement>('.cand')];
  await sleep(250);
  if (aborted()) return false;
  els.forEach((el, i) => el.classList.add(rows[i]?.index === res.pick ? 'picked' : 'dim'));
  const c = res.stats[res.pick];
  const total = Math.max(
    1,
    res.stats.reduce((a, s) => a + s.visits, 0),
  );
  cg.setAutoShapes([
    {
      orig: c.from as Key,
      dest: c.to as Key,
      brush: 'pick',
      modifiers: { lineWidth: 8 + (c.visits / total) * 10 },
    },
  ]);
  const status = root.querySelector('#t-status');
  if (status) status.textContent = `${res.sims} simulations · ${(res.ms / 1000).toFixed(1)}s`;
  await sleep(550);
  return !aborted();
}
