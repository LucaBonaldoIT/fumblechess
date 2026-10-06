export type Outcome = 'win' | 'loss' | 'draw';

const TITLE: Record<Outcome, string> = {
  win: 'You won',
  loss: 'You lost',
  draw: 'Draw',
};

export function closeGameOver() {
  document.querySelector('.board-over')?.remove();
}

/** Game-over card shown as an overlay on `host` (the board), not on the whole page. */
export function showGameOver(
  host: HTMLElement,
  outcome: Outcome,
  reason: string,
  actions: { onNew: () => void; onCopy: () => void },
) {
  closeGameOver();
  const el = document.createElement('div');
  el.className = `board-over over ${outcome}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', TITLE[outcome]);
  el.innerHTML = `
    <div class="dlg">
      <h2>${TITLE[outcome]}</h2>
      <p class="sub">${reason}</p>
      <div class="over-actions">
        <button type="button" class="primary" data-act="new">New game</button>
        <button type="button" class="secondary" data-act="copy">Copy PGN</button>
        <button type="button" class="ghost" data-act="close">Close</button>
      </div>
    </div>`;
  const close = () => {
    el.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'copy')
      actions.onCopy(); // stays open so you can still start a new game
    else if (act === 'new') {
      close();
      actions.onNew();
    } else if (act === 'close' || t === el) close();
  });
  document.addEventListener('keydown', onKey);
  host.append(el);
  el.querySelector<HTMLElement>('[data-act="new"]')!.focus();
}
