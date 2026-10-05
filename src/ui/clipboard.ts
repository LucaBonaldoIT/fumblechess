let toastEl: HTMLElement | undefined;
let toastTimer: number | undefined;

export function toast(message: string) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'toast';
    toastEl.setAttribute('role', 'status');
    document.body.append(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl!.classList.remove('show'), 2200);
}

/** Fallback for browsers/contexts where the async clipboard API is unavailable or blocked. */
function copyLegacy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.append(ta);
  ta.select();
  try {
    return document.execCommand('copy');
  } finally {
    ta.remove();
  }
}

/** Copy a PGN to the clipboard. */
export async function copyPgn(pgn: string) {
  try {
    try {
      await navigator.clipboard.writeText(pgn);
    } catch {
      if (!copyLegacy(pgn)) throw new Error('copy failed');
    }
    toast('PGN copied to clipboard');
  } catch {
    toast('Could not copy the PGN');
  }
}
