/* UI12 — restrained interface sound effects.
   No assets, network requests, autoplay, or typing-key sounds. AudioContext is created lazily
   only after an enabled user interaction reaches playUiAudio(). */

const PROFILES = Object.freeze({
  navigate: Object.freeze({ frequency: 360, endFrequency: 410, duration: 0.035, gain: 0.012, type: "sine" }),
  activate: Object.freeze({ frequency: 520, endFrequency: 690, duration: 0.055, gain: 0.018, type: "sine" }),
  toggle: Object.freeze({ frequency: 440, endFrequency: 560, duration: 0.045, gain: 0.016, type: "triangle" }),
  back: Object.freeze({ frequency: 390, endFrequency: 300, duration: 0.05, gain: 0.014, type: "sine" }),
  danger: Object.freeze({ frequency: 190, endFrequency: 150, duration: 0.07, gain: 0.016, type: "triangle" }),
});

let enabled = false;
let audioContext = null;

function AudioContextConstructor() {
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

function getContext() {
  if (audioContext) return audioContext;
  const Constructor = AudioContextConstructor();
  if (!Constructor) return null;
  try {
    audioContext = new Constructor();
  } catch {
    audioContext = null;
  }
  return audioContext;
}

export function setUiAudioEnabled(value) {
  enabled = value === true;
  if (!enabled && audioContext?.state === "running") {
    void audioContext.suspend?.().catch?.(() => {});
  }
  return enabled;
}

export function isUiAudioEnabled() {
  return enabled;
}

export function playUiAudio(kind = "activate") {
  if (!enabled) return false;
  const profile = PROFILES[kind] || PROFILES.activate;
  const context = getContext();
  if (!context) return false;

  try {
    if (context.state === "suspended") void context.resume?.();
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = profile.type;
    oscillator.frequency.setValueAtTime(profile.frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(profile.endFrequency, now + profile.duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(profile.gain, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + profile.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + profile.duration + 0.008);
    return true;
  } catch {
    return false;
  }
}

export function getUiAudioDiagnostic() {
  return Object.freeze({ enabled, contextCreated: audioContext != null, contextState: audioContext?.state || "none" });
}
