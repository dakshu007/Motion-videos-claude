#!/usr/bin/env python3
"""Royalty-free background music, synthesized from scratch (no samples, no
licences to worry about): a soft lo-fi bed with Rhodes chords, bass, brushed
drums and vinyl crackle. Each seed gives a different progression and key.

  python3 tools/music.py --seconds 35 --seed 7 --mood chill --out bed.wav
"""
import argparse

import numpy as np
import soundfile as sf

SR = 44100

PROGRESSIONS = {
    "chill": [
        [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]],   # Fmaj7 Em7 Dm7 Cmaj7
        [[45, 48, 52, 55], [50, 53, 57, 60], [43, 47, 50, 53], [48, 52, 55, 59]],   # Am7 Dm7 G7 Cmaj7
        [[50, 53, 57, 60], [43, 47, 50, 53], [48, 52, 55, 59], [45, 48, 52, 55]],   # ii V I vi
    ],
    "upbeat": [
        [[48, 52, 55, 60], [43, 50, 55, 59], [45, 52, 57, 60], [41, 48, 53, 57]],   # C G Am F
        [[41, 48, 53, 57], [43, 50, 55, 59], [45, 52, 57, 60], [45, 52, 57, 60]],   # F G Am Am
    ],
}


def hz(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def place(buf, start, sig):
    i = int(start * SR)
    if i >= len(buf):
        return
    sig = sig[: len(buf) - i]
    buf[i:i + len(sig)] += sig


def rhodes(f, dur, vel=1.0):
    t = np.arange(int(dur * SR)) / SR
    tone = np.sin(2 * np.pi * f * t) + 0.32 * np.exp(-t * 3) * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.exp(-t * 6) * np.sin(2 * np.pi * 3 * f * t)
    env = (1 - np.exp(-t * 90)) * np.exp(-t * 0.9)
    trem = 1 + 0.07 * np.sin(2 * np.pi * 4.3 * t)
    return vel * 0.12 * tone * env * trem


def bass(f, dur):
    t = np.arange(int(dur * SR)) / SR
    tone = np.tanh(1.6 * np.sin(2 * np.pi * f * t))
    return 0.22 * tone * (1 - np.exp(-t * 200)) * np.exp(-t * 2.6)


def kick():
    t = np.arange(int(0.35 * SR)) / SR
    f = 45 + 70 * np.exp(-t * 28)
    return 0.55 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14)


def noise_hit(rng, dur, decay, hp=True, amp=0.1):
    n = rng.standard_normal(int(dur * SR))
    if hp:
        n = np.diff(n, prepend=0.0)
    else:  # gentle low-pass for a brushed snare
        n = np.convolve(n, np.ones(6) / 6, mode="same")
    t = np.arange(len(n)) / SR
    return amp * n * np.exp(-t * decay)


def lowpass(x, k=3):
    return np.convolve(x, np.ones(k) / k, mode="same")


def make(seconds, seed, mood):
    rng = np.random.default_rng(seed)
    progs = PROGRESSIONS.get(mood, PROGRESSIONS["chill"])
    prog = progs[seed % len(progs)]
    transpose = int(rng.integers(-3, 3))
    bpm = (82 if mood == "chill" else 100) + int(rng.integers(-4, 5))
    beat = 60 / bpm
    bar = beat * 4
    n = int((seconds + 2) * SR)
    keys, low, drums = np.zeros(n), np.zeros(n), np.zeros(n)
    t = 0.0
    k = 0
    while t < seconds + 1:
        chord = [x + transpose for x in prog[k % len(prog)]]
        for j, note in enumerate(chord):  # gently strummed
            place(keys, t + j * 0.018, rhodes(hz(note), bar * 1.05, 0.9))
            place(keys, t + beat * 2.5 + j * 0.012, rhodes(hz(note + 12 if j == len(chord) - 1 else note), beat * 1.5, 0.45))
        root = hz(chord[0] - 12)
        place(low, t, bass(root, beat * 1.8))
        place(low, t + beat * 2, bass(root, beat * 1.5))
        if k > 0 or True:
            place(drums, t, kick())
            place(drums, t + beat * 2.5, kick() * 0.6)
            for b in (1, 3):
                place(drums, t + b * beat, noise_hit(rng, 0.25, 20, hp=False, amp=0.09))
            for e in range(8):  # swung eighth-note hats
                swing = 0.08 * beat if e % 2 else 0
                place(drums, t + e * beat / 2 + swing, noise_hit(rng, 0.06, 70, amp=0.018 if e % 2 else 0.028))
        t += bar
        k += 1
    vinyl = lowpass(rng.standard_normal(n), 25) * 0.012
    clicks = np.zeros(n)
    for i in rng.integers(0, n, size=int(seconds * 3)):
        clicks[i] = rng.uniform(0.05, 0.15)
    mix_l = keys + low + drums + vinyl + clicks
    delay = int(0.012 * SR)  # Haas widening on the keys
    mix_r = np.roll(keys, delay) + low + drums + vinyl + np.roll(clicks, 7)
    stereo = np.stack([lowpass(mix_l, 4), lowpass(mix_r, 4)], axis=1)[: int(seconds * SR)]
    stereo = np.tanh(stereo * 1.2)
    fade_in, fade_out = int(1.0 * SR), int(1.8 * SR)
    stereo[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    stereo[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]
    return stereo / max(1e-6, np.abs(stereo).max()) * 0.8


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, required=True)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--mood", default="chill")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    sf.write(a.out, make(a.seconds, a.seed, a.mood), SR)
    print(a.out)
