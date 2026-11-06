// Generates the built-in reminder tones (original, synthesized here) as 16-bit mono WAV.
// Output: assets/sounds/*.wav and android/app/src/main/res/raw/*.wav (Android channel sounds).
// Run: node scripts/make-reminder-sounds.mjs
import fs from 'node:fs';
import path from 'node:path';

const RATE = 22050;

function wav(samples) {
  // Normalize to a clean peak so overlapping notes never clip.
  const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0) || 1;
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, index) => data.writeInt16LE(Math.round(value / peak * 0.85 * 32767), index * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// A bell-like note: a few inharmonic partials with a quick attack and exponential decay.
function bell(buffer, at, frequency, length, volume, decay = 3.2) {
  const partials = [[1, 1], [2.01, 0.42], [2.76, 0.2], [4.07, 0.12]];
  const start = Math.round(at * RATE);
  for (let i = 0; i < length * RATE && start + i < buffer.length; i++) {
    const t = i / RATE;
    const envelope = Math.min(1, t / 0.006) * Math.exp(-decay * t);
    let value = 0;
    for (const [ratio, gain] of partials) value += gain * Math.sin(2 * Math.PI * frequency * ratio * t);
    buffer[start + i] += value * envelope * volume;
  }
}

// A soft sine pulse with gentle attack and release.
function pulse(buffer, at, frequency, length, volume) {
  const start = Math.round(at * RATE);
  for (let i = 0; i < length * RATE && start + i < buffer.length; i++) {
    const t = i / RATE;
    const envelope = Math.sin(Math.PI * Math.min(1, t / length));
    buffer[start + i] += Math.sin(2 * Math.PI * frequency * t) * envelope * envelope * volume;
  }
}

const tones = {
  // 上课铃: a two-note "ding-dong", repeated for about eight seconds.
  class_bell: (() => {
    const out = new Float32Array(Math.round(8 * RATE));
    for (let round = 0; round < 6; round++) {
      bell(out, round * 1.3, 659.25, 1.2, 0.36);
      bell(out, round * 1.3 + 0.55, 523.25, 1.2, 0.36);
    }
    return out;
  })(),
  // 清脆: a quick rising three-note chime, five times over six seconds.
  chime: (() => {
    const out = new Float32Array(Math.round(6 * RATE));
    for (let round = 0; round < 5; round++) {
      [1046.5, 1318.5, 1568].forEach((note, step) => bell(out, round * 1.2 + step * 0.13, note, 0.9, 0.26, 4.5));
    }
    return out;
  })(),
  // 柔和: gentle pulses, one per second for five seconds.
  soft: (() => {
    const out = new Float32Array(Math.round(5 * RATE));
    for (let round = 0; round < 5; round++) pulse(out, round, 784, 0.55, 0.45);
    return out;
  })(),
};

const root = path.resolve(import.meta.dirname, '..');
for (const folder of ['assets/sounds', 'android/app/src/main/res/raw']) fs.mkdirSync(path.join(root, folder), { recursive: true });
for (const [name, samples] of Object.entries(tones)) {
  const file = wav(samples);
  for (const folder of ['assets/sounds', 'android/app/src/main/res/raw']) fs.writeFileSync(path.join(root, folder, `${name}.wav`), file);
  console.log(`${name}.wav ${(file.length / 1024).toFixed(0)} KB, ${(samples.length / RATE).toFixed(1)} s`);
}
