import type { Level, SearchConfig } from './types';

/**
 * One model per difficulty level, each trained on human games from that Elo bucket (see ml/).
 * A smaller search budget and a higher temperature stay closer to the raw human-like policy.
 * Keep `search` in sync with ml/bot.py.
 */
export const LEVELS: { id: Level; label: string; elo: string; search: SearchConfig }[] = [
  {
    id: 1,
    label: 'Beginner',
    elo: '800–1200',
    search: { sims: 24, maxMs: 1500, temperature: 1.0 },
  },
  { id: 2, label: 'Club', elo: '1600–2400', search: { sims: 96, maxMs: 2500, temperature: 0.8 } },
  { id: 3, label: 'Master', elo: '2800+', search: { sims: 180, maxMs: 4500, temperature: 0.6 } },
];
