# Security policy

FumbleChess is a static site. The chess engine, the neural networks and Stockfish all run inside the
visitor's own browser (WebAssembly, in Web Workers) and nothing is sent to a server. Games and
settings are kept in the browser's `localStorage`.

If you find a vulnerability (for example an XSS through the About content, a PGN, or a crafted saved
game), please report it privately through
[GitHub security advisories](https://github.com/LucaBonaldoIT/fumblechess/security/advisories/new)
instead of a public issue. Expect a reply within a few days.
