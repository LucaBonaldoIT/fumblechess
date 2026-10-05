// Sound effects are synthesised with the Web Audio API: no audio files to ship or license.
let ctx: AudioContext | undefined;
let noise: AudioBuffer | undefined;

function audio(): AudioContext | undefined {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume(); // allowed once the user has interacted with the page
    return ctx;
  } catch {
    return undefined;
  }
}

/** One second of white noise, reused for every click. */
function noiseBuffer(c: AudioContext): AudioBuffer {
  if (!noise) {
    noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noise;
}

/** A short filtered noise burst: the "click" of a piece landing on a wooden board. */
function click(
  c: AudioContext,
  t: number,
  { freq, q, gain, dur }: { freq: number; q: number; gain: number; dur: number },
) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const env = c.createGain();
  env.gain.setValueAtTime(gain, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(env).connect(c.destination);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

/** A sine that decays quickly: gives the click some body. */
function thump(
  c: AudioContext,
  t: number,
  { freq, gain, dur }: { freq: number; gain: number; dur: number },
) {
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
  const env = c.createGain();
  env.gain.setValueAtTime(gain, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function chime(c: AudioContext, t: number, freq: number) {
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  osc.connect(env).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.4);
}

function playNow(play: (c: AudioContext, t: number) => void) {
  const c = audio();
  if (c) play(c, c.currentTime);
}

export function playMove(san: string) {
  const capture = san.includes('x');
  playNow((c, t) => {
    if (capture) {
      click(c, t, { freq: 1100, q: 0.9, gain: 0.9, dur: 0.09 });
      click(c, t + 0.035, { freq: 700, q: 0.8, gain: 0.5, dur: 0.07 });
      thump(c, t, { freq: 140, gain: 0.6, dur: 0.12 });
    } else {
      click(c, t, { freq: 1500, q: 1.2, gain: 0.6, dur: 0.05 });
      thump(c, t, { freq: 190, gain: 0.45, dur: 0.07 });
    }
  });
}

export function playGameOver() {
  playNow((c, t) => {
    chime(c, t, 659.25); // E5
    chime(c, t + 0.14, 880); // A5
  });
}
