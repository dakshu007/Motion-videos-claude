#!/usr/bin/env python3
"""Free, open-source voice-over with Kokoro-82M via kokoro-onnx (MIT/Apache-2.0).

Python twin of tools/kokoro.mjs for machines where Python is handier or where
Hugging Face is blocked: the model comes from the kokoro-onnx GitHub release.

  pip install kokoro-onnx soundfile
  python3 tools/kokoro_tts.py --setup                      # download models/ (~120 MB, once)
  python3 tools/kokoro_tts.py jobs.json                    # [{"text","voice","speed","out"}, ...]
  python3 tools/kokoro_tts.py --say "Hello!" --voice af_heart --out hello.wav
"""
import argparse
import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.path.join(ROOT, "models")
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
FILES = ["kokoro-v1.0.int8.onnx", "voices-v1.0.bin"]


def setup():
    os.makedirs(MODELS, exist_ok=True)
    for name in FILES:
        path = os.path.join(MODELS, name)
        if not os.path.exists(path):
            print(f"downloading {name} ...", file=sys.stderr)
            urllib.request.urlretrieve(RELEASE + name, path)
    return [os.path.join(MODELS, f) for f in FILES]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("jobs", nargs="?")
    ap.add_argument("--setup", action="store_true")
    ap.add_argument("--say")
    ap.add_argument("--voice", default="af_heart")
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--out", default="out/voice-samples/sample.wav")
    args = ap.parse_args()

    model, voices = setup()
    if args.setup:
        return

    import soundfile as sf
    from kokoro_onnx import Kokoro

    kokoro = Kokoro(model, voices)
    jobs = json.load(open(args.jobs)) if args.jobs else [{"text": args.say or "Hi! This is a free Kokoro voice.", "voice": args.voice, "speed": args.speed, "out": args.out}]
    for job in jobs:
        lang = "en-gb" if job.get("voice", "af_heart").startswith("b") else "en-us"
        samples, sr = kokoro.create(job["text"], voice=job.get("voice", "af_heart"), speed=job.get("speed", 1.0), lang=lang)
        os.makedirs(os.path.dirname(os.path.abspath(job["out"])), exist_ok=True)
        sf.write(job["out"], samples, sr)
        print(job["out"])


if __name__ == "__main__":
    main()
