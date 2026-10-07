type AudioCtor = typeof AudioContext;

export interface Sfx {
  unlock: () => void;
  alarm: () => void;
  tick: () => void;
  rule: () => void;
  verdict: () => void;
  shield: () => void;
  shatter: () => void;
}

export function createSfx(): Sfx {
  let ctx: AudioContext | null = null;

  const context = () => {
    if (typeof window === "undefined") return null;
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    return ctx;
  };

  const tone = (freq: number, duration = 0.12, type: OscillatorType = "sine", volume = 0.08, slide?: number) => {
    const audio = context();
    if (!audio) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const now = audio.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now + duration);
  };

  const noise = (duration = 0.35, volume = 0.18) => {
    const audio = context();
    if (!audio) return;
    const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * duration), audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    const source = audio.createBufferSource();
    const gain = audio.createGain();
    const filter = audio.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 900;
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start();
  };

  return {
    unlock() {
      const audio = context();
      if (audio?.state === "suspended") void audio.resume();
    },
    alarm() {
      tone(880, 0.16, "square", 0.05);
      window.setTimeout(() => tone(660, 0.16, "square", 0.05), 180);
      window.setTimeout(() => tone(880, 0.16, "square", 0.05), 360);
    },
    tick: () => tone(1320, 0.05, "sine", 0.05),
    rule: () => tone(520, 0.09, "triangle", 0.07),
    verdict: () => tone(220, 0.35, "sawtooth", 0.06, 110),
    shield() {
      tone(90, 0.6, "sine", 0.25, 45);
      tone(660, 0.5, "sine", 0.05, 1320);
    },
    shatter() {
      noise(0.45, 0.22);
      tone(180, 0.3, "square", 0.06, 60);
    },
  };
}
