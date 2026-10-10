"""Speech to text for one audio file with faster-whisper, word by word.

Called by scripts/transcribe.ts, which fetches the audio and stores the result;
this file only runs the model. Output is JSON on disk (see WhisperOutputSchema in
lib/ingest/whisper.ts): every word with its start and end in milliseconds.

    python transcribe.py <audio> <out.json> [--model small.en] [--models-dir DIR]
"""

import argparse
import json
import sys
import time

import faster_whisper
from faster_whisper import WhisperModel


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    parser.add_argument("out")
    parser.add_argument("--model", default="small.en")
    parser.add_argument("--models-dir", default=None)
    parser.add_argument("--threads", type=int, default=0, help="0 = let CTranslate2 decide")
    args = parser.parse_args()

    started = time.monotonic()
    print(f"loading model {args.model} (first run downloads it)...", file=sys.stderr, flush=True)
    # CPU with int8 weights: the GPU on the owner's laptop is too old and too
    # small for CTranslate2, and int8 roughly halves memory and time on CPU.
    model = WhisperModel(
        args.model,
        device="cpu",
        compute_type="int8",
        download_root=args.models_dir,
        cpu_threads=args.threads,
    )

    segments, info = model.transcribe(
        args.audio,
        # The ".en" models only speak English; naming it skips detection.
        language="en",
        beam_size=5,
        # Word times come from the model's alignment, and are what lines are
        # cut and timed by; segment times alone drift by a second or more.
        word_timestamps=True,
        # Skips silence and applause, where Whisper otherwise invents text.
        vad_filter=True,
    )

    total_ms = int(round(info.duration * 1000))
    words = []
    last_report = 0.0
    for segment in segments:
        for word in segment.words or []:
            words.append(
                {
                    "startMs": max(0, int(round(word.start * 1000))),
                    "endMs": max(0, int(round(word.end * 1000))),
                    "text": word.word,
                }
            )
        now = time.monotonic()
        if now - last_report >= 5 and total_ms > 0:
            last_report = now
            done = min(100, round(segment.end * 1000 * 100 / total_ms))
            print(f"  {done}% of the audio, {round(now - started)} s elapsed", file=sys.stderr, flush=True)

    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(
            {
                "engine": "faster-whisper",
                "engineVersion": faster_whisper.__version__,
                "model": args.model,
                "language": info.language,
                "durationMs": total_ms,
                "words": words,
            },
            handle,
            ensure_ascii=False,
        )

    elapsed = time.monotonic() - started
    print(
        f"done: {len(words)} words from {total_ms / 60000:.1f} min of audio in {elapsed / 60:.1f} min",
        file=sys.stderr,
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
