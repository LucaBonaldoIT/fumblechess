const link = (href: string, text: string) =>
  `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;

const PIECE_NAME: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

/**
 * A static board diagram (cburnett pieces from Chessground's CSS, so it needs the .cg-wrap class).
 * `mark` is outlined, `last` gets the last-move tint.
 */
function diagram(placement: string, mark: string, last: string[]): string {
  let squares = '';
  let pieces = '';
  placement.split('/').forEach((row, y) => {
    let x = 0;
    for (const c of row) {
      if (/\d/.test(c)) {
        x += Number(c);
        continue;
      }
      const color = c === c.toUpperCase() ? 'white' : 'black';
      pieces += `<piece class="${PIECE_NAME[c.toLowerCase()]} ${color}" style="transform:translate(${x * 100}%,${y * 100}%)"></piece>`;
      x++;
    }
  });
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const sq = 'abcdefgh'[x] + (8 - y);
      const cls = [(x + y) % 2 ? 'd' : 'l', last.includes(sq) ? 'lm' : '', sq === mark ? 'mk' : '']
        .filter(Boolean)
        .join(' ');
      squares += `<span class="${cls}"></span>`;
    }
  }
  return `<div class="ab-board cg-wrap" role="img" aria-label="Board after 1. e4 e5 2. Nf3, square e4 highlighted"><div class="ab-squares">${squares}</div>${pieces}</div>`;
}

/** The 34 numbers of square e4 after 1. e4 e5 2. Nf3, grouped as in src/engine/encoding.ts. */
const TOKEN: { key: string; title: string; values: number[] }[] = [
  { key: 'a', title: 'pieces', values: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { key: 'b', title: 'turn and castling', values: [0, 1, 1, 1, 1] },
  { key: 'c', title: 'en passant', values: [0] },
  { key: 'd', title: 'seen before', values: [0, 0] },
  { key: 'e', title: 'clocks', values: [0.01, 0.02] },
  { key: 'f', title: 'last 6 moves', values: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0] },
];

const token = () =>
  `<div class="ab-token" aria-hidden="true">${TOKEN.map(
    (g) =>
      `<span class="g" data-k="${g.key}">${g.values
        .map((v) => `<i style="--v:${v}" title="${g.title}: ${v}"></i>`)
        .join('')}<b>${g.key}</b></span>`,
  ).join('')}</div>`;

/** One frame of the tree-search figure: the same small tree with different parts lit. */
const tree = (under: string, over = '') =>
  `<svg viewBox="0 0 120 96" aria-hidden="true">
    <g class="e"><path d="M60 14 25 48M60 14v34M60 14l35 34M60 48 42 82"/></g>${under}
    <g class="n"><circle cx="60" cy="14" r="6"/><circle cx="25" cy="48" r="5"/><circle cx="60" cy="48" r="5"/><circle cx="95" cy="48" r="5"/><circle cx="42" cy="82" r="4.5"/></g>${over}
  </svg>`;

const SELECT = tree(
  `<path class="hot" d="M60 14v34l18 34"/><circle class="ghost" cx="78" cy="82" r="4.5"/>`,
);
const EXPAND = tree(
  `<path class="hot" d="M60 48l18 34"/><circle class="new" cx="78" cy="82" r="6"/><text x="90" y="85">net</text>`,
);
const BACKUP = tree(
  `<path class="hot" d="M60 14v34l18 34"/><circle class="lit" cx="78" cy="82" r="4.5"/>
   <path class="up" d="M56 34l4-4 4 4M66.8 68.3l1.2-5.1 5 1.9"/>
   <text x="86" y="86">+.3</text><text x="66" y="40">−.3</text><text x="68" y="11">+.3</text>`,
);
const CHOOSE = tree(
  `<path class="e" d="M60 48l18 34"/><circle class="n2" cx="78" cy="82" r="4.5"/>`,
  `<circle class="n2" cx="25" cy="48" r="7"/><circle class="lit" cx="60" cy="48" r="10"/><circle class="n2" cx="95" cy="48" r="4"/>
   <text x="9" y="68">25</text><text x="66" y="68">62</text><text x="96" y="68">13</text>`,
);

/** Static "About" + credits content, rendered below the game. */
export const aboutHtml = `
<div class="about-inner">
  <header class="ab-hero">
    <p class="ab-kicker">Notes on the opponent</p>
    <h2>How FumbleChess works <span class="ab-glyph" aria-hidden="true">??</span></h2>
    <p class="ab-lede">
      Your opponent is a neural network that learned chess by imitation. It was shown about a million positions from
      real games per level and trained to guess <em>which move the human played</em>. On top of that it runs a small
      Monte-Carlo tree search, deliberately short and always guided by the human-trained network. The goal is not the
      strongest possible chess. It is play that feels like a person of a given rating, blunders included.
    </p>
    <dl class="ab-facts">
      <div><dt>~1M</dt><dd>Lichess positions per level</dd></div>
      <div><dt>7M</dt><dd>parameters per network</dd></div>
      <div><dt>24–180</dt><dd>positions searched per move</dd></div>
      <div><dt>0</dt><dd>servers: it runs in your browser</dd></div>
    </dl>
  </header>

  <section class="ab-sec">
    <h3><span class="n">1.</span> From board to move</h3>
    <p class="ab-prose">
      The network does not see a picture of the board. It sees 64 tokens, one per square, and each token is a list of
      34 numbers. Here is square <b>e4</b> after <span class="ab-san">1. e4 e5 2. Nf3</span>:
    </p>
    <figure class="ab-fig ab-see">
      ${diagram('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R', 'e4', ['g1', 'f3'])}
      <div class="ab-see-side">
        <p class="ab-cap">Token e4 · 34 numbers</p>
        ${token()}
        <dl class="ab-legend">
          <div><dt>a</dt><dd><b>Pieces</b>, 12 on/off flags. One is on: a white pawn stands here.</dd></div>
          <div><dt>b</dt><dd><b>Turn and castling.</b> Black to move (0), all four castling rights (1 1 1 1).</dd></div>
          <div><dt>c</dt><dd><b>En passant</b> target square. Not this one.</dd></div>
          <div><dt>d</dt><dd><b>Seen before</b>, once or twice: how the network notices repetitions.</dd></div>
          <div><dt>e</dt><dd><b>Clocks.</b> The 50-move clock and the move number, divided by 100.</dd></div>
          <div><dt>f</dt><dd><b>Last 6 moves</b>, a from and a to flag each. The pawn arrived here three plies ago, because people react to what was just played.</dd></div>
        </dl>
      </div>
    </figure>

    <p class="ab-prose">Those 64 tokens then go through four stages:</p>
    <ol class="ab-flow">
      <li><code>64 × 34</code><b>Square encoder</b><span>A learned layer turns each token into 256 numbers and adds an “I am square e4” embedding.</span></li>
      <li><code>64 × 256</code><b>Local mixer</b><span>Two ConvMixer blocks slide a 3×3 filter over the grid. Pawn chains and castled kings are neighbourhood things.</span></li>
      <li><code>64 × 256</code><b>Transformer</b><span>8 layers of self-attention, 8 heads each. Every square can look at every other, so a bishop sees down its diagonal.</span></li>
      <li class="heads"><code>4,096 · 3</code><b>Two heads</b><span><i>Policy:</i> a score for every from → to pair, 64 × 64. <i>Value:</i> win, draw and loss.</span></li>
    </ol>
  </section>

  <section class="ab-sec">
    <h3><span class="n">2.</span> Three opponents, three crowds</h3>
    <p class="ab-prose">
      Each level is its own network, trained on the ${link('https://database.lichess.org', 'Lichess open database')}
      (January to April 2024). A game counts only if <em>both</em> players are inside the band, because a 1000-rated and a
      2500-rated player differ in which moves they choose, not only in how often they blunder. The policy head learns to
      put probability on the move the human actually played (illegal moves are masked out); the value head learns the
      game's final result. 3,500 steps of 512 positions, about 30 minutes per level on a laptop.
    </p>
    <div class="ab-tablewrap">
      <table class="ab-cross">
        <thead>
          <tr><th scope="col">Level</th><th scope="col"><i>1</i>Beginner</th><th scope="col"><i>2</i>Club</th><th scope="col"><i>3</i>Master</th></tr>
        </thead>
        <tbody>
          <tr><th scope="row">Lichess rating of both players</th><td>800–1200</td><td>1600–2400</td><td>2400+</td></tr>
          <tr><th scope="row">Games × positions per game</th><td>100k × 10</td><td>100k × 10</td><td>40k × 25</td></tr>
          <tr class="agree"><th scope="row">Plays the human's move<sup>1</sup></th><td><span style="--p:44.9">44.9%</span></td><td><span style="--p:42.4">42.4%</span></td><td><span style="--p:43.2">43.2%</span></td></tr>
          <tr><th scope="row">Positions searched per move</th><td>24</td><td>96</td><td>180</td></tr>
          <tr><th scope="row">Temperature <var>T</var></th><td>1.0</td><td>0.8</td><td>0.6</td></tr>
          <tr><th scope="row">Rating against Stockfish<sup>2</sup></th><td>840 ± 196</td><td>1074 ± 138</td><td>1312 ± 121</td></tr>
        </tbody>
      </table>
    </div>
    <p class="ab-notes">
      <sup>1</sup> Top-1 agreement on held-out positions the network never trained on.
      <sup>2</sup> Fitted from games against limited-strength Stockfish, on Stockfish's own Elo scale, which is not the Lichess
      scale of the training data. A rough, relative number.
    </p>
  </section>

  <section class="ab-sec">
    <h3><span class="n">3.</span> Thinking ahead, a little</h3>
    <p class="ab-prose">
      One glance at the board gives the AI a gut feeling: which moves look natural, and who seems to be winning. The
      search tests that feeling by playing a few lines out in its head, one <b>simulation</b> at a time.
    </p>
    <ol class="ab-loop">
      <li>${SELECT}<b>Select</b><span>Walk down the tree, at each step taking the move with the best mix of <i>how good it has looked</i> and <i>how natural the network finds it</i>, plus a bonus for moves tried rarely (PUCT).</span></li>
      <li>${EXPAND}<b>Expand</b><span>At a position never seen before, ask the network once: the policy gives each move a <b>prior</b>, the value says who is better. No random playouts.</span></li>
      <li>${BACKUP}<b>Back up</b><span>Pass that value up the path, flipping its sign at every ply: good for one player is bad for the other.</span></li>
      <li>${CHOOSE}<b>Choose</b><span>When the budget is spent, <b>sample</b> a move by how often each was visited. Not always the top one, so no two games are alike.</span></li>
    </ol>
    <p class="ab-prose">
      <b>Why so little search?</b> With 24 to 180 simulations (and a time cap) the visit counts stay close to the
      network's human priors. The search only nudges the AI away from moves its own value head dislikes, so it keeps
      its human habits. And it still fumbles, on purpose:
    </p>
    <ul class="ab-fumbles">
      <li><span class="ab-nag">?!</span><p><b>It samples.</b> The most-visited move is likely, not certain. Lower levels sample more loosely.</p></li>
      <li><span class="ab-nag">?</span><p><b>Its judgement is rough.</b> The value head was trained on who won human games, not on deep analysis.</p></li>
      <li><span class="ab-nag">??</span><p><b>It sees a few moves ahead.</b> A tactic one ply past the horizon is invisible, just like at the club.</p></li>
    </ul>
    <aside class="ab-aside">
      <p class="ab-cap">On screen</p>
      <p>
        The <b>AI thoughts</b> panel is this search, live. Each row is a candidate move: the bar and percentage show
        its share of the simulations, the small number on the right is the expected score after that move (0–100).
        Arrows on the board get thicker for moves searched more, and the chosen move turns red. The coloured strip is
        the value head's first impression, before any search. Hover a row to see the move's prior.
      </p>
    </aside>
  </section>

  <section class="ab-sec">
    <h3><span class="n">4.</span> The bar is a different brain</h3>
    <div class="ab-versus">
      <div>
        <p class="ab-cap">Plays</p>
        <h4>FumbleChess network</h4>
        <ul>
          <li>Learned from people</li>
          <li>Asks “what would a player of this rating play?”</li>
          <li>About 20&nbsp;ms per position, a handful of them</li>
          <li>Outputs a move</li>
        </ul>
      </div>
      <span class="vs" aria-hidden="true">vs</span>
      <div>
        <p class="ab-cap">Judges</p>
        <h4>${link('https://stockfishchess.org', 'Stockfish')}</h4>
        <ul>
          <li>Calculates by brute force</li>
          <li>Asks “what is objectively best?”</li>
          <li>300&nbsp;ms of deep search</li>
          <li>Outputs centipawns (100 = one pawn), or <code>M3</code> for a forced mate</li>
        </ul>
      </div>
    </div>
    <p class="ab-prose">
      The centipawn score becomes an expected result for White, which fills the bar. So the AI plays like a human while
      the bar judges like an engine. When the two disagree, you have probably just watched a human-style mistake.
    </p>

    <details class="ab-math">
      <summary>Show the maths</summary>
      <dl>
        <div><dt>Priors</dt><dd>The policy head scores each legal move <i>i</i> with <i>s<sub>i</sub></i>; a softmax turns them into priors: <code>P<sub>i</sub> = exp(s<sub>i</sub>) / Σ<sub>j</sub> exp(s<sub>j</sub>)</code>.</dd></div>
        <div><dt>Value</dt><dd>The value head gives win, draw and loss probabilities. For the side to move, <code>v = P(win) − P(loss)</code>, between −1 and 1. A move's expected score is <code>(v + 1) / 2</code>.</dd></div>
        <div><dt>Selection (PUCT)</dt><dd>At a node with <i>N</i> visits, pick the move maximising <code>Q + c · P · √N / (1 + n)</code>: <i>Q</i> its average value so far for the mover, <i>P</i> its prior, <i>n</i> its visits, <i>c</i> = 1.5. Untried moves start at their parent's value minus 0.2.</dd></div>
        <div><dt>Final choice</dt><dd>With root visit counts <i>n<sub>i</sub></i>, the move is drawn with probability <code>n<sub>i</sub><sup>1/T</sup> / Σ<sub>j</sub> n<sub>j</sub><sup>1/T</sup></code>. A lower <i>T</i> leans harder on the most-visited move.</dd></div>
        <div><dt>Speed</dt><dd>Positions are evaluated 8 at a time, with “virtual loss” so the 8 walks spread out. Each costs about 20&nbsp;ms in WebAssembly on one thread, hence the small budgets.</dd></div>
        <div><dt>Bar fill</dt><dd><code>E = 1 / (1 + 10<sup>−cp / 400</sup>)</code>, the standard Elo logistic. 0 cp gives 50%, +100 cp about 64%, +400 cp about 91%.</dd></div>
        <div><dt>Policy size</dt><dd>64 from-squares × 64 to-squares = 4,096. The head builds a query and a key vector per square and scores each pair by their dot product. Promotions are always to a queen.</dd></div>
        <div><dt>Training loss</dt><dd>Policy: cross-entropy between the softmax over legal moves and the human move. Value: cross-entropy between the predicted win/draw/loss and the game result.</dd></div>
      </dl>
    </details>
  </section>

  <section class="ab-sec">
    <h3><span class="n">5.</span> It all runs in your browser</h3>
    <p class="ab-prose">
      The networks run with ${link('https://onnxruntime.ai', 'ONNX Runtime Web')} (WebAssembly) in a worker, and
      Stockfish runs in another. Nothing is sent to a server. Your game, level, colour and theme stay in your browser's
      local storage.
    </p>
  </section>

  <section class="ab-credits">
    <h2 id="credits">Credits</h2>
    <div class="ab-credit-cols">
      <div>
        <h4>Ideas and research</h4>
        <ol class="ab-refs">
          <li>McIlroy-Young, Sen, Kleinberg, Anderson. ${link('https://arxiv.org/abs/2006.01855', 'Aligning Superhuman AI with Human Behavior: Chess as a Model System')}. KDD 2020 (Maia). The idea of one model per rating band.</li>
          <li>Tang, Jiao, McIlroy-Young et al. ${link('https://arxiv.org/abs/2409.20553', 'Maia-2: A Unified Model for Human-AI Alignment in Chess')}. NeurIPS 2024.</li>
          <li>Ruoss et al. ${link('https://arxiv.org/abs/2402.04494', 'Amortized Planning with Large-Scale Transformers: A Case Study on Chess')}. NeurIPS 2024. Transformers playing chess without search.</li>
          <li>Vaswani et al. ${link('https://arxiv.org/abs/1706.03762', 'Attention Is All You Need')}. NeurIPS 2017.</li>
          <li>Xiong et al. ${link('https://arxiv.org/abs/2002.04745', 'On Layer Normalization in the Transformer Architecture')}. ICML 2020 (pre-LayerNorm).</li>
          <li>Trockman and Kolter. ${link('https://arxiv.org/abs/2201.09792', 'Patches Are All You Need?')} 2022 (ConvMixer).</li>
          <li>Kocsis and Szepesvári. <i>Bandit Based Monte-Carlo Planning.</i> ECML 2006 (UCT, the basis of tree search).</li>
          <li>Browne et al. ${link('https://doi.org/10.1109/TCIAIG.2012.2186810', 'A Survey of Monte Carlo Tree Search Methods')}. IEEE Transactions on Computational Intelligence and AI in Games, 2012.</li>
          <li>Silver et al. ${link('https://www.science.org/doi/10.1126/science.aar6404', 'A general reinforcement learning algorithm that masters chess, shogi, and Go through self-play')}. Science 2018 (policy and value heads, and neural-network-guided tree search with PUCT).</li>
        </ol>
      </div>
      <div>
        <h4>Data</h4>
        <ul>
          <li>${link('https://database.lichess.org', 'Lichess open database')}: games from lichess.org players, released under CC0.</li>
        </ul>
        <h4>Engine</h4>
        <ul>
          <li>${link('https://stockfishchess.org', 'Stockfish')} by the Stockfish developers (GPLv3).</li>
          <li>${link('https://github.com/nmrugg/stockfish.js', 'Stockfish.js')} by Nathan Rugg and Chess.com (GPLv3), the WebAssembly build used for the evaluation bar.</li>
        </ul>
        <h4>Software</h4>
        <ul>
          <li>${link('https://github.com/lichess-org/chessground', 'Chessground')}, the board, by the Lichess team (GPL-3.0-or-later).</li>
          <li>${link('https://github.com/jhlywa/chess.js', 'chess.js')} by Jeff Hlywa (BSD-2-Clause), game rules.</li>
          <li>${link('https://github.com/niklasf/python-chess', 'python-chess')} by Niklas Fiekas (GPL-3.0), data preparation.</li>
          <li>${link('https://pytorch.org', 'PyTorch')} (Paszke et al., NeurIPS 2019), model and training.</li>
          <li>${link('https://onnxruntime.ai', 'ONNX Runtime Web')} by Microsoft (MIT), running the models in the browser.</li>
          <li>${link('https://vite.dev', 'Vite')} (MIT) and ${link('https://www.typescriptlang.org', 'TypeScript')} (Apache-2.0).</li>
        </ul>
        <h4>Pieces</h4>
        <ul>
          <li>Piece set “cburnett” by Colin M.L. Burnett (GPL-2.0-or-later), shipped with Chessground; board colours from its brown theme.</li>
        </ul>
      </div>
    </div>
    <p class="disclaimer">FumbleChess is an educational project. It is not affiliated with Lichess, Chess.com or the Stockfish team.</p>
  </section>
</div>`;
