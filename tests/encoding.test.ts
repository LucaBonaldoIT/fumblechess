import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/encoding.json';
import { encodeBoard, N_FEATURES } from '../src/engine/encoding';

// The reference vectors come from ml/encode.py (see ml/export_encoding_fixture.py): the network is trained on the
// Python encoding and runs on the TypeScript one, so the two must agree exactly.
describe('board encoding matches the Python encoder', () => {
  for (const c of fixtures) {
    it(c.name, () => {
      const chess = new Chess();
      for (const san of c.moves) chess.move(san);
      const got = encodeBoard(chess, c.prevOccurrences);
      expect(got.length).toBe(64 * N_FEATURES);
      const worst = Math.max(...Array.from(got, (v, i) => Math.abs(v - c.features[i])));
      expect(worst).toBeLessThan(1e-6);
    });
  }
});
