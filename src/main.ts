import { Chess, SQUARES } from 'chess.js';
import type { Square } from 'chess.js';
import { Chessground } from '@lichess-org/chessground';
import type { Key } from '@lichess-org/chessground/types';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import { evalBar } from './engine/eval';
import { LEVELS } from './engine/levels';
import {
  currentSearch,
  evaluateBatch,
  modelState,
  onModelStateChange,
  setLevel,
} from './engine/network';
import { search } from './engine/mcts';
import { analyse } from './engine/stockfish';
import type { SfScore } from './engine/stockfish';
import type { Level } from './engine/types';
import { copyPgn } from './ui/clipboard';
import { closeGameOver, showGameOver } from './ui/dialogs';
import type { Outcome } from './ui/dialogs';
import { playGameOver, playMove } from './ui/sound';
import { initTheme } from './ui/theme';
import {
  commitThoughts,
  initThoughts,
  liveThoughts,
  resetThoughts,
  showScanning,
} from './ui/thoughts';
import './style.css';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header id="top">
    <h1><span class="logo">♞</span><span>Fumble<b>Chess</b></span></h1>
    <div class="tools">
      <button id="theme" class="icon-btn" type="button" aria-label="Toggle dark mode" title="Toggle dark mode"></button>
      <a
        class="icon-btn"
        href="https://github.com/LucaBonaldoIT/fumblechess"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="FumbleChess on GitHub"
        title="View the source on GitHub"
        ><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path
            d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.17c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"
          /></svg
      ></a>
    </div>
  </header>
  <main id="game">
    <div id="evalbar" title="Stockfish evaluation"><div id="evalfill"></div><span id="evaltext"></span></div>
    <div id="wrap">
      <div id="board"></div>
      <div id="promo" hidden></div>
    </div>
    <aside id="side">
      <div class="player" id="p-top"></div>
      <section id="thoughts" aria-live="polite"></section>
      <div id="moves" aria-label="Moves"></div>
      <div id="nav">
        <button type="button" data-nav="first" aria-label="First position" title="First (Home)">«</button>
        <button type="button" data-nav="prev" aria-label="Previous move" title="Previous (←)">‹</button>
        <button type="button" data-nav="next" aria-label="Next move" title="Next (→)">›</button>
        <button type="button" data-nav="last" aria-label="Back to live" title="Live (End)">»</button>
        <button type="button" class="js-copy copy-icon" aria-label="Copy PGN" title="Copy the game as PGN"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg></button>
      </div>
      <div id="controls">
        <div id="levels" role="radiogroup" aria-label="Difficulty">${LEVELS.map(
          (l) =>
            `<button type="button" role="radio" data-level="${l.id}" title="Trained on ${l.elo} Elo games" aria-label="${l.label}, ${l.elo} Elo"><b>${l.label}</b></button>`,
        ).join('')}</div>
        <div id="sides" role="radiogroup" aria-label="Play as">
          <button type="button" role="radio" data-side="w"><span class="glyph">♔</span><b>White</b></button>
          <button type="button" role="radio" data-side="random"><span class="glyph">?</span><b>Random</b></button>
          <button type="button" role="radio" data-side="b"><span class="glyph">♚</span><b>Black</b></button>
        </div>
        <div class="actions">
          <button id="reset" type="button">New game</button>
        </div>
      </div>
      <div class="player" id="p-bottom"></div>
    </aside>
  </main>
`;

initTheme(document.querySelector<HTMLButtonElement>('#theme')!);
initThoughts(document.querySelector<HTMLElement>('#thoughts')!);

const LEVEL_KEY = 'deepchess:level';
let level: Level = 1;
try {
  const saved = Number(localStorage.getItem(LEVEL_KEY));
  if (saved === 1 || saved === 2 || saved === 3) level = saved;
} catch {
  // storage unavailable: default level
}
setLevel(level);

const COLOR_KEY = 'deepchess:color';
/** The side the human plays; the AI plays the other. */
let human: 'w' | 'b' = 'w'; // fresh session: White
try {
  const saved = localStorage.getItem(COLOR_KEY);
  if (saved === 'w' || saved === 'b') human = saved;
} catch {
  // storage unavailable: play White
}

/** What the next "New game" uses. */
type SidePref = 'w' | 'b' | 'random';
const SIDE_KEY = 'deepchess:side';
let sidePref: SidePref = 'w';
try {
  const saved = localStorage.getItem(SIDE_KEY);
  if (saved === 'w' || saved === 'b' || saved === 'random') sidePref = saved;
} catch {
  // storage unavailable: White
}

const STORAGE_KEY = 'deepchess:pgn';
const chess = new Chess();
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) chess.loadPgn(saved);
} catch {
  chess.reset(); // corrupt or unavailable storage: start fresh
}

/** Resigning is recorded in the PGN headers, so a resigned game stays over after a reload. */
function resigned(): boolean {
  return chess.getHeaders().Termination === 'resignation';
}
function gameOver(): boolean {
  return chess.isGameOver() || resigned();
}

function legalDests(): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  for (const s of SQUARES) {
    const moves = chess.moves({ square: s as Square, verbose: true });
    if (moves.length)
      dests.set(
        s as Key,
        moves.map((m) => m.to as Key),
      );
  }
  return dests;
}

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const NAMES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
};
let evalScore: SfScore | null = null; // Stockfish score, White's point of view
let evalSeq = 0;

/** Update the bar for `pos` (the position on the board: live, or one being viewed in the history). */
function updateEval(pos: Chess = chess) {
  let result: 'white' | 'black' | 'draw' | null = null;
  if (pos.isCheckmate()) result = pos.turn() === 'w' ? 'black' : 'white';
  else if (pos.isDraw()) result = 'draw';
  const { white, label } = evalBar(evalScore, result);
  const pct = Math.round(white * 100);
  document.querySelector<HTMLElement>('#evalbar')!.style.setProperty('--eval', String(pct / 100));
  const t = document.querySelector<HTMLElement>('#evaltext')!;
  t.textContent = label;
  t.className = pct >= 50 ? 'white-lead' : 'black-lead';
}

/** Ask Stockfish about `pos`; the bar keeps its last value until the new score arrives. */
function requestEval(pos: Chess) {
  const mine = ++evalSeq;
  updateEval(pos);
  if (pos.isGameOver()) return;
  void analyse(pos.fen())
    .then((score) => {
      if (mine !== evalSeq || !score) return;
      evalScore = score;
      updateEval(pos);
    })
    .catch((err) => console.error('Stockfish failed', err));
}

/** Ply being viewed (1 = after White's first move); null = live position. */
let viewPly: number | null = null;

function updateMoves() {
  const el = document.querySelector<HTMLElement>('#moves')!;
  const sans = chess.history();
  const current = viewPly ?? sans.length;
  const mv = (i: number) =>
    sans[i] === undefined
      ? '<span class="mv"></span>'
      : `<span class="mv${current === i + 1 ? ' active' : ''}" data-ply="${i + 1}" role="button" tabindex="-1">${sans[i]}</span>`;
  let html = '';
  for (let i = 0; i < sans.length; i += 2)
    html += `<span class="num">${i / 2 + 1}.</span>${mv(i)}${mv(i + 1)}`;
  el.innerHTML = html || '<span class="empty">No moves yet</span>';
  const active = el.querySelector<HTMLElement>('.mv.active');
  if (viewPly !== null && active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  else {
    el.scrollTop = el.scrollHeight;
    el.scrollLeft = el.scrollWidth;
  }
  const total = sans.length;
  const nav = (k: string) => document.querySelector<HTMLButtonElement>(`#nav [data-nav="${k}"]`)!;
  nav('first').disabled = nav('prev').disabled = current === 0;
  nav('next').disabled = nav('last').disabled = current === total;
  for (const b of document.querySelectorAll<HTMLButtonElement>('.js-copy'))
    b.disabled = total === 0;
}

/** Show the position after `ply` moves (read-only); the last ply returns to the live game. */
function viewMove(ply: number) {
  const history = chess.history({ verbose: true });
  const target = Math.max(0, Math.min(ply, history.length));
  if (thinking) return; // the AI is mid-move; its arrows are drawn on the live position
  if (target === history.length) {
    viewPly = null;
    sync();
    return;
  }
  viewPly = target;
  const g = new Chess();
  for (const m of history.slice(0, target))
    g.move({ from: m.from, to: m.to, promotion: m.promotion });
  const last = history[target - 1];
  cg.setAutoShapes([]);
  cg.set({
    fen: g.fen(),
    turnColor: g.turn() === 'w' ? 'white' : 'black',
    check: g.inCheck(),
    lastMove: last ? [last.from as Key, last.to as Key] : undefined,
    movable: { color: undefined, dests: new Map() },
  });
  if (last) playMove(last.san);
  updateMoves();
  requestEval(g);
}

function updatePlayers() {
  const captured = { w: [] as string[], b: [] as string[] }; // pieces captured BY that colour
  for (const m of chess.history({ verbose: true }))
    if (m.captured) captured[m.color].push(m.captured);
  let balance = 0; // white minus black material on board
  for (const row of chess.board())
    for (const c of row)
      if (c && c.type !== 'k') balance += VALUE[c.type] * (c.color === 'w' ? 1 : -1);
  const card = (id: string, name: string, tag: string, color: 'w' | 'b', avatar: string) => {
    const victim = color === 'w' ? 'black' : 'white';
    const pieces = captured[color]
      .sort((a, b) => VALUE[b] - VALUE[a])
      .map((t) => `<piece class="${victim} ${NAMES[t]}"></piece>`)
      .join('');
    const lead = color === 'w' ? balance : -balance;
    document.querySelector(id)!.innerHTML = `
      <div class="avatar ${avatar}">${tag}</div>
      <div class="info">
        <div class="name">${name}</div>
        <div class="captured cg-wrap">${pieces}${lead > 0 ? `<span class="points">+${lead}</span>` : ''}</div>
      </div>`;
  };
  const lv = LEVELS.find((l) => l.id === level)!;
  const ai = human === 'w' ? 'b' : 'w';
  card('#p-top', `FumbleChess AI <span class="elo">${lv.label}</span>`, 'AI', ai, 'av-ai');
  card('#p-bottom', 'You', 'You', human, 'av-you');
}

// `gen` invalidates in-flight AI moves when a new game starts.
let gen = 0;
let thinking = false;

/** Is the current level's network downloaded and initialised? Nothing can be played before. */
const modelReady = () => modelState(level) === 'ready';
const modelsLoading = () => LEVELS.some((l) => modelState(l.id) === 'loading');

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, chess.pgn());
  } catch {
    // storage unavailable: play on without persistence
  }
}

function sync() {
  viewPly = null;
  const last = chess.history({ verbose: true }).at(-1);
  const lastMove = last ? ([last.from, last.to] as [Key, Key]) : undefined;
  save();
  cg.set({
    fen: chess.fen(),
    turnColor: chess.turn() === 'w' ? 'white' : 'black',
    check: chess.inCheck(),
    lastMove,
    movable: {
      color:
        gameOver() || chess.turn() !== human || !modelReady()
          ? undefined
          : human === 'w'
            ? 'white'
            : 'black',
      dests: legalDests(),
    },
  });
  updatePlayers();
  updateMoves();
  requestEval(chess);
  renderLevels();
  if (gameOver()) announceGameOver();
  else if (chess.turn() !== human && !thinking && modelReady()) void aiMove();
}

const MIN_THINK_MS = 900; // even a tiny search should stay visible long enough to read

async function aiMove() {
  const mine = gen;
  thinking = true;
  renderLevels();
  try {
    showScanning();
    const t0 = performance.now();
    const res = await search(chess, {
      evaluate: evaluateBatch,
      config: currentSearch(),
      aborted: () => mine !== gen,
      onProgress: (stats, sims, wdl) => {
        if (mine === gen) liveThoughts(cg, stats, sims, wdl);
      },
    });
    if (!res || mine !== gen) return;
    const wait = MIN_THINK_MS - (performance.now() - t0);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const done = await commitThoughts(cg, res, () => mine !== gen);
    if (!done) return;
    thinking = false;
    cg.setAutoShapes([]);
    const m = res.stats[res.pick];
    playMove(chess.move({ from: m.from, to: m.to, promotion: m.promotion }).san);
    sync();
  } catch (err) {
    console.error('AI failed', err);
    if (mine === gen) thinking = false;
  }
}

const promoEl = document.querySelector<HTMLDivElement>('#promo')!;

function askPromotion(color: 'white' | 'black', to: Key): Promise<'q' | 'r' | 'b' | 'n'> {
  return new Promise((resolve) => {
    // the board is oriented to the human, so promotion is always on the top edge and the column grows down
    const file = to.charCodeAt(0) - 97;
    const col = human === 'w' ? file : 7 - file;
    const items = (
      [
        ['q', 'queen'],
        ['r', 'rook'],
        ['b', 'bishop'],
        ['n', 'knight'],
      ] as const
    )
      .map(
        ([k, name]) =>
          `<div class="choice" data-p="${k}"><piece class="${color} ${name}"></piece></div>`,
      )
      .join('');
    promoEl.innerHTML = `<div class="card cg-wrap top" style="left:${col * 12.5}%">${items}</div>`;
    promoEl.onclick = (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-p]');
      if (!el) return; // selection is mandatory
      promoEl.hidden = true;
      promoEl.innerHTML = '';
      resolve(el.dataset.p as 'q' | 'r' | 'b' | 'n');
    };
    promoEl.hidden = false;
  });
}

const brush = (key: string, color: string, opacity: number) => ({
  key,
  color,
  opacity,
  lineWidth: 10,
});
const cg = Chessground(document.querySelector<HTMLElement>('#board')!, {
  drawable: {
    brushes: {
      green: brush('green', '#15781B', 0.5),
      red: brush('red', '#882020', 0.5),
      blue: brush('blue', '#003088', 0.5),
      yellow: brush('yellow', '#e68f00', 1),
      cand: brush('cand', '#3b82f6', 0.55), // candidate moves
      pick: brush('pick', '#b02e0c', 0.95), // move the AI commits to
    },
  },
  movable: {
    free: false,
    events: {
      after: async (from, to) => {
        const piece = chess.get(from as Square);
        let promotion: 'q' | 'r' | 'b' | 'n' | undefined;
        if (piece?.type === 'p' && (to[1] === '8' || to[1] === '1')) {
          promotion = await askPromotion(piece.color === 'w' ? 'white' : 'black', to);
        }
        playMove(chess.move({ from, to, promotion }).san);
        sync();
      },
    },
  },
});

function applyOrientation() {
  cg.set({ orientation: human === 'w' ? 'white' : 'black' });
  document.querySelector('#evalbar')!.classList.toggle('flip', human === 'b');
}

function startGame(color: 'w' | 'b') {
  closeGameOver();
  promoEl.hidden = true;
  promoEl.innerHTML = '';
  gen++;
  thinking = false;
  resetThoughts(cg);
  evalScore = null;
  overAnnounced = false;
  human = color;
  try {
    localStorage.setItem(COLOR_KEY, color);
  } catch {
    // storage unavailable: choice just won't persist
  }
  applyOrientation();
  chess.reset();
  sync(); // if the AI plays white it moves first
}

function newGame() {
  startGame(sidePref === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : sidePref);
}

/** A game is running once a move has been played and until it ends: the button resigns it. */
const gameRunning = () => !gameOver() && chess.history().length > 0;

function resign() {
  if (!confirm('Resign this game?')) return;
  gen++; // abort the AI if it is thinking
  thinking = false;
  resetThoughts(cg);
  chess.setHeader('Result', human === 'w' ? '0-1' : '1-0');
  chess.setHeader('Termination', 'resignation');
  sync();
}
document.querySelector('#reset')!.addEventListener('click', () => {
  if (gameRunning()) resign();
  else newGame();
});

const sideButtons = [...document.querySelectorAll<HTMLButtonElement>('#sides button')];
function renderSides() {
  for (const b of sideButtons) {
    const on = b.dataset.side === sidePref;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
  }
}
for (const b of sideButtons) {
  b.addEventListener('click', () => {
    sidePref = b.dataset.side as SidePref;
    try {
      localStorage.setItem(SIDE_KEY, sidePref);
    } catch {
      // storage unavailable: choice just won't persist
    }
    renderSides();
  });
}
renderSides();

/** PGN with proper headers, for sharing. */
function buildPgn(): string {
  const g = new Chess();
  g.loadPgn(chess.pgn());
  const lv = LEVELS.find((l) => l.id === level)!;
  const ai = `FumbleChess AI (${lv.label}, ${lv.elo})`;
  let result = '*';
  if (resigned()) result = human === 'w' ? '0-1' : '1-0';
  else if (chess.isCheckmate()) result = chess.turn() === 'w' ? '0-1' : '1-0';
  else if (chess.isDraw()) result = '1/2-1/2';
  g.setHeader('Event', 'FumbleChess game');
  g.setHeader('Site', 'FumbleChess');
  g.setHeader('Date', new Date().toISOString().slice(0, 10).replaceAll('-', '.'));
  g.setHeader('White', human === 'w' ? 'You' : ai);
  g.setHeader('Black', human === 'b' ? 'You' : ai);
  g.setHeader('Result', result);
  return g.pgn();
}
for (const b of document.querySelectorAll('.js-copy'))
  b.addEventListener('click', () => void copyPgn(buildPgn()));

let overAnnounced = gameOver(); // don't pop the dialog for a finished game restored on load

function gameOutcome(): { outcome: Outcome; reason: string } {
  if (resigned()) return { outcome: 'loss', reason: 'by resignation' };
  if (chess.isCheckmate())
    return { outcome: chess.turn() === human ? 'loss' : 'win', reason: 'by checkmate' };
  if (chess.isStalemate()) return { outcome: 'draw', reason: 'by stalemate' };
  if (chess.isThreefoldRepetition()) return { outcome: 'draw', reason: 'by threefold repetition' };
  if (chess.isInsufficientMaterial())
    return { outcome: 'draw', reason: 'by insufficient material' };
  if (chess.isDrawByFiftyMoves()) return { outcome: 'draw', reason: 'by the fifty-move rule' };
  return { outcome: 'draw', reason: '' };
}

function announceGameOver() {
  if (overAnnounced) return;
  overAnnounced = true;
  const mine = gen;
  playGameOver();
  const { outcome, reason } = gameOutcome();
  // let the final move land before the dialog covers the board
  setTimeout(() => {
    if (mine !== gen) return;
    showGameOver(document.querySelector<HTMLElement>('#wrap')!, outcome, reason, {
      onNew: newGame,
      onCopy: () => void copyPgn(buildPgn()),
    });
  }, 700);
}
document.querySelector('#moves')!.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ply]');
  if (el) viewMove(Number(el.dataset.ply));
});
document.querySelector('#nav')!.addEventListener('click', (e) => {
  const k = (e.target as HTMLElement).closest<HTMLElement>('[data-nav]')?.dataset.nav;
  const now = viewPly ?? chess.history().length;
  if (k === 'first') viewMove(0);
  else if (k === 'prev') viewMove(now - 1);
  else if (k === 'next') viewMove(now + 1);
  else if (k === 'last') viewMove(Infinity);
});
document.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || (e.target as HTMLElement).closest('input, textarea'))
    return;
  const now = viewPly ?? chess.history().length;
  const go = { ArrowLeft: now - 1, ArrowRight: now + 1, Home: 0, End: Infinity }[e.key];
  if (go === undefined) return;
  e.preventDefault();
  viewMove(go);
});

const levelButtons = [...document.querySelectorAll<HTMLButtonElement>('#levels button')];
/** Difficulty can only change before the first move or after the game has ended. */
const levelLocked = () => !gameOver() && (chess.history().length > 0 || thinking);

function renderLevels() {
  const locked = levelLocked();
  const loading = modelsLoading();
  document.querySelector<HTMLElement>('#levels')!.title = locked
    ? 'Difficulty is locked during a game. Finish or resign it to change it.'
    : '';
  for (const b of levelButtons) {
    const id = Number(b.dataset.level) as Level;
    const on = id === level;
    b.classList.toggle('active', on);
    b.classList.toggle('loading', modelState(id) === 'loading'); // spinner while its model downloads
    b.setAttribute('aria-checked', String(on));
    b.setAttribute('aria-busy', String(modelState(id) === 'loading'));
    b.disabled = locked || loading;
  }
  const btn = document.querySelector<HTMLButtonElement>('#reset')!;
  const running = gameRunning();
  btn.textContent = running ? 'Resign' : 'New game';
  btn.disabled = !running && !modelReady(); // no new game without a model
}
for (const b of levelButtons) {
  b.addEventListener('click', () => {
    if (levelLocked()) return;
    level = Number(b.dataset.level) as Level;
    setLevel(level);
    try {
      localStorage.setItem(LEVEL_KEY, String(level));
    } catch {
      // storage unavailable: choice just won't persist
    }
    renderLevels();
    updatePlayers();
    if (modelReady()) sync(); // already downloaded earlier: nothing to wait for
  });
}
renderLevels();
applyOrientation();
sync();

// when a model finishes (or fails) downloading: update the controls, then enable the board and let the AI start
onModelStateChange(() => {
  renderLevels();
  if (!modelsLoading() && !thinking && viewPly === null) sync();
});
