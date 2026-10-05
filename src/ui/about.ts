const link = (href: string, text: string) =>
  `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;

/** Static "About" + credits content, rendered below the game. */
export const aboutHtml = `
<div class="about-inner">
  <h2>How FumbleChess works</h2>
  <p class="lede">
    Your opponent is a neural network that learned chess by imitation. It was shown tens of thousands of positions from
    real games and trained to guess <em>which move the human played</em>. On top of that it runs a small
    <em>Monte-Carlo tree search</em>, but the search is deliberately short and always guided by the human-trained
    network. The goal is not the strongest possible chess. It is play that feels like a person of a given rating,
    blunders included.
  </p>

  <h3>1 · From board to move</h3>
  <ol class="pipeline">
    <li><b>See the board</b><span>The position becomes 64 tokens, one per square. Each token is 22 numbers: 12 on/off flags (white pawn … black king), side to move, 4 castling rights, the en-passant square, two flags for a position that has already occurred once or twice (repetition), and the two move counters (the 50-move clock and the move number).</span></li>
    <li><b>Square encoder</b><span>A learned layer turns those 22 numbers into a 256-number vector and adds a learned “I am square e4” embedding, so the network knows where each token sits.</span></li>
    <li><b>Local mixer</b><span>Two ConvMixer blocks slide a 3×3 filter over the 8×8 grid. Neighbouring squares matter in chess (pawn chains, a castled king), so they get mixed cheaply before the expensive part.</span></li>
    <li><b>Transformer</b><span>Eight layers of self-attention, 8 heads each. Every square can look at every other square, so a bishop can “see” down a diagonal to a far-away king. About 7 million parameters in total.</span></li>
    <li class="heads"><b>Two heads</b>
      <span><i>Policy:</i> a score for every from-square → to-square pair (64 × 64 = 4,096 possible moves).<br><i>Value:</i> three numbers: win, draw and loss estimates.</span>
    </li>
  </ol>

  <h3>2 · How it was trained</h3>
  <div class="cards">
    <div class="card-a">
      <h4>Real human games</h4>
      <p>From the ${link('https://database.lichess.org', 'Lichess open database')} (January 2024). A game is kept only if <em>both</em> players are inside the rating band. Then 10 random positions are sampled from each of 8,000 games, about 80,000 positions per model.</p>
    </div>
    <div class="card-a">
      <h4>Three models, three bands</h4>
      <p><b>Beginner</b> 800–1200, <b>Club</b> 1600–2400, <b>Master</b> 2800+. A 1000-rated and a 2900-rated player differ in <em>which moves they choose</em>, so each model imitates its own group. Master games are so rare that bullet games are included to find enough.</p>
    </div>
    <div class="card-a">
      <h4>What it learns from</h4>
      <p>The policy head is trained to put probability on the move the human actually played (illegal moves are masked out). The value head is trained on the final result of the game. Each model trained for 1,500 steps, about 4 minutes on a laptop GPU.</p>
    </div>
  </div>

  <h3>3 · Thinking ahead: tree search</h3>
  <p>
    A single glance at the board gives the AI a gut feeling: which moves look natural, and who seems to be winning. The
    search lets it test that feeling by playing a few lines out in its head. It builds a tree of positions, one
    <b>simulation</b> at a time:
  </p>
  <ol class="steps">
    <li><b>Select.</b> Starting from the current position, walk down the tree. At each step pick the move with the best mix of <i>how good it has looked so far</i> and <i>how natural the network thought it was</i>, with a bonus for moves that have been tried rarely (the “PUCT” rule).</li>
    <li><b>Expand and evaluate.</b> When the walk reaches a position it has never seen, ask the network about it once. The policy head says how natural each legal move is (the <b>prior</b>). The value head says how good the position is. There are no random playouts to the end of the game.</li>
    <li><b>Back up.</b> Pass that value back up the path, flipping its sign at every ply because what is good for one player is bad for the other.</li>
    <li><b>Repeat,</b> then choose. After the budget is spent the AI <b>samples</b> its move from how often each one was visited. It does not just take the most visited, so it never plays the same game twice.</li>
  </ol>
  <p>
    <b>Why so little search?</b> The budget depends on the level: about 24 simulations for Beginner, 96 for Club and up
    to 180 for Master, with a time cap. With so few simulations the visit counts stay close to the network's human-like
    priors, so the AI keeps its human habits. The search mostly nudges it away from moves its own value head dislikes.
    Blunders still happen, on purpose, for three reasons: it samples instead of always taking the best, its value head
    is a rough judge, and it only sees a few moves ahead.
  </p>
  <p>
    The <b>AI thoughts</b> panel is this search, live. Each row is a candidate move: the bar and percentage show its
    share of the simulations, and the small number on the right is the AI's expected score after that move (0–100).
    Arrows on the board get thicker for moves searched more. When it decides, the chosen move turns red. The coloured
    strip is the value head's first impression of the position, before any searching. Hover a row to see the move's
    prior probability.
  </p>

  <h3>4 · The evaluation bar is a different brain</h3>
  <p>
    The bar uses ${link('https://stockfishchess.org', 'Stockfish')}, a classical engine that <em>calculates</em>: it
    searches for 300&nbsp;ms and scores the position in centipawns (100 = one pawn). That score is converted into an
    expected result for White, which fills the bar; forced mates show as <code>M3</code>. So the AI plays like a human,
    while the bar judges like an engine. When they disagree, that is usually a human-style mistake.
  </p>

  <details>
    <summary>Show the maths</summary>
    <div class="math">
      <p><b>Priors.</b> The policy head gives each legal move <i>i</i> a score <i>s<sub>i</sub></i>. They become prior probabilities with a softmax: <code>P<sub>i</sub> = exp(s<sub>i</sub>) / Σ<sub>j</sub> exp(s<sub>j</sub>)</code>.</p>
      <p><b>Value.</b> The value head outputs win, draw and loss probabilities for White. For the side to move, <code>v = P(win) − P(loss)</code>, a number between −1 and 1. A move's expected score is <code>(v + 1) / 2</code>.</p>
      <p><b>Selection rule (PUCT).</b> At a node with <i>N</i> visits, choose the move that maximises <code>Q + c · P · √N / (1 + n)</code>, where <i>Q</i> is the average value of that move so far (from the mover's point of view), <i>P</i> its prior, <i>n</i> its own visit count and <i>c</i> = 1.5. Untried moves start slightly pessimistic (their parent's value minus 0.2).</p>
      <p><b>Final choice.</b> With visit counts <i>n<sub>i</sub></i> at the root, the move is drawn with probability <code>n<sub>i</sub><sup>1/T</sup> / Σ<sub>j</sub> n<sub>j</sub><sup>1/T</sup></code>. T is 1.0 for Beginner, 0.8 for Club and 0.6 for Master: a lower T leans harder on the most-visited move.</p>
      <p><b>Speed.</b> Positions are evaluated 8 at a time (with “virtual loss” so the 8 walks go to different places). Each position costs about 20&nbsp;ms in WebAssembly on one thread, which is why the budgets are small.</p>
      <p><b>Centipawns to bar fill.</b> <code>E = 1 / (1 + 10<sup>−cp / 400</sup>)</code>: the standard Elo logistic. 0 cp gives 50%; +100 cp gives about 64%; +400 cp gives about 91%.</p>
      <p><b>Policy size.</b> 64 from-squares × 64 to-squares = 4,096. The head builds a query vector and a key vector for every square and scores each from/to pair by their dot product. Promotions are always to a queen.</p>
      <p><b>Training loss.</b> Policy: cross-entropy between the softmax over legal moves and the human move. Value: cross-entropy between the predicted win/draw/loss and the game result.</p>
    </div>
  </details>

  <h3>5 · It all runs in your browser</h3>
  <p>
    The models run with ${link('https://onnxruntime.ai', 'ONNX Runtime Web')} (WebAssembly) and Stockfish runs in a Web
    Worker. Nothing is sent to a server. Your game, level, colour and theme are kept in your browser's local storage.
  </p>

  <h2 id="credits">Credits</h2>
  <div class="credits">
    <div>
      <h4>Ideas and research</h4>
      <ul>
        <li>McIlroy-Young, Sen, Kleinberg, Anderson. ${link('https://arxiv.org/abs/2006.01855', 'Aligning Superhuman AI with Human Behavior: Chess as a Model System')}. KDD 2020 (Maia). The idea of one model per rating band.</li>
        <li>Tang, Jiao, McIlroy-Young et al. ${link('https://arxiv.org/abs/2409.20553', 'Maia-2: A Unified Model for Human-AI Alignment in Chess')}. NeurIPS 2024.</li>
        <li>Ruoss et al. ${link('https://arxiv.org/abs/2402.04494', 'Amortized Planning with Large-Scale Transformers: A Case Study on Chess')}. NeurIPS 2024. Transformers playing chess without search.</li>
        <li>Vaswani et al. ${link('https://arxiv.org/abs/1706.03762', 'Attention Is All You Need')}. NeurIPS 2017.</li>
        <li>Xiong et al. ${link('https://arxiv.org/abs/2002.04745', 'On Layer Normalization in the Transformer Architecture')}. ICML 2020 (pre-LayerNorm).</li>
        <li>Trockman and Kolter. ${link('https://arxiv.org/abs/2201.09792', 'Patches Are All You Need?')} 2022 (ConvMixer).</li>
        <li>Kocsis and Szepesvári. <i>Bandit Based Monte-Carlo Planning.</i> ECML 2006 (UCT, the basis of tree search).</li>
        <li>Browne et al. ${link('https://doi.org/10.1109/TCIAIG.2012.2186810', 'A Survey of Monte Carlo Tree Search Methods')}. IEEE Transactions on Computational Intelligence and AI in Games, 2012.</li>
        <li>Silver et al. ${link('https://www.science.org/doi/10.1126/science.aar6404', 'A general reinforcement learning algorithm that masters chess, shogi, and Go through self-play')}. Science 2018 (policy and value heads, and neural-network-guided tree search with PUCT).</li>
      </ul>
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
</div>`;
