// js/sounds.js
// Tiny Web Audio API helper that synthesizes soft, pleasant chimes on the
// fly. No external files to download, no autoplay surprises. Each function
// takes a best-effort approach and silently no-ops if the browser blocks
// AudioContext (e.g. before first user gesture).

(function () {
  let _ctx = null;
  function ctx() {
    if (_ctx) return _ctx;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      _ctx = new Ctor();
    } catch {
      _ctx = null;
    }
    return _ctx;
  }

  // Shape an ADSR-like envelope onto a gain node so tones don't click.
  function shapeEnvelope(gain, now, opts) {
    const { attack = 0.02, decay = 0.18, sustain = 0.0, release = 0.35, peak = 0.22 } = opts;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);
    gain.gain.linearRampToValueAtTime(peak * 0.6, now + attack + decay);
    gain.gain.linearRampToValueAtTime(sustain, now + attack + decay + 0.05);
    gain.gain.linearRampToValueAtTime(0, now + attack + decay + release);
  }

  function tone(freq, startOffset, dur, type, peak) {
    const c = ctx();
    if (!c) return;
    // If the context is suspended (pre-gesture), try to resume — the call
    // only succeeds after a real click/tap, which is fine since these sounds
    // are all triggered from click/submit paths or follow a previous click.
    if (c.state === "suspended") c.resume().catch(() => {});
    const now = c.currentTime + startOffset;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, now);
    osc.connect(gain);
    gain.connect(c.destination);
    shapeEnvelope(gain, now, {
      attack: 0.02,
      decay: 0.15,
      sustain: 0,
      release: dur - 0.17,
      peak: peak || 0.18,
    });
    osc.start(now);
    osc.stop(now + dur);
  }

  // Success / submission chime — two-note rising arpeggio in C major.
  // Reads as "done, nicely". Meant for the moment an application submits.
  window.playSubmitChime = function playSubmitChime() {
    tone(523.25, 0.00, 0.55, "sine", 0.22); // C5
    tone(659.25, 0.12, 0.55, "sine", 0.22); // E5
    tone(783.99, 0.24, 0.70, "sine", 0.20); // G5
  };

  // Incoming-notification ping — softer, a single mid-high bell. Different
  // in character from the chime so you can tell them apart at a glance.
  window.playNotifPing = function playNotifPing() {
    tone(880,    0.00, 0.40, "triangle", 0.16); // A5
    tone(1174.6, 0.05, 0.50, "triangle", 0.12); // D6
  };
})();
