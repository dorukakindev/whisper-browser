#!/usr/bin/env python3
"""Generate a ~40s speech clip: per-sentence flite wavs + silence gaps, muxed into mp4."""
import subprocess, os, sys

OUT = "/home/ubuntu/qa-114"
os.makedirs(f"{OUT}/seg", exist_ok=True)

# Mirrors adversarial corpus themes: sentence boundaries, questions, numbers, names, SDH-free dialogue.
SENTENCES = [
    "Wait. Are you sure you want to come with me?",
    "It costs two point four million dollars, Marcus.",
    "I told her not to open the door, but she did anyway.",
    "The meeting starts at nine thirty on Tuesday morning.",
    "And I was like, no way, that can't be true.",
    "So he left the building before anyone noticed.",
    "Did you really think I wouldn't find out?",
    "Three hundred people showed up to the event last night.",
]

def run(cmd, **kw):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        print("FAIL:", cmd, "\n", r.stderr[-500:])
        sys.exit(1)
    return r

wavs = []
for i, s in enumerate(SENTENCES):
    w = f"{OUT}/seg/s{i:02d}.wav"
    run(f"ffmpeg -hide_banner -loglevel error -f lavfi -i \"flite=text='{s}':voice=slt\" -ar 16000 -ac 1 -y {w}")
    wavs.append(w)

# concat with alternating silence gaps 0.7s / 1.4s / 0.5s
parts = []
for i, w in enumerate(wavs):
    parts.append(w)
    if i < len(wavs) - 1:
        gap = [0.7, 1.4, 0.5, 1.0, 0.8, 1.2, 0.6][i % 7]
        g = f"{OUT}/seg/gap{i:02d}.wav"
        run(f"ffmpeg -hide_banner -loglevel error -f lavfi -i \"anullsrc=r=16000:cl=mono\" -t {gap} -y {g}")
        parts.append(g)

with open(f"{OUT}/concat.txt", "w") as f:
    for p in parts:
        f.write(f"file '{p}'\n")

run(f"ffmpeg -hide_banner -loglevel error -f concat -safe 0 -i {OUT}/concat.txt -c copy -y {OUT}/speech.wav")
dur = run(f"ffprobe -v error -show_entries format=duration -of csv=p=0 {OUT}/speech.wav").stdout.strip()
print("speech.wav duration:", dur)

# mux with a visible clock-ish video so overlay timing can be eyeballed
run(f"ffmpeg -hide_banner -loglevel error -f lavfi -i testsrc2=size=640x360:rate=15 -i {OUT}/speech.wav -t {dur} -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest -y {OUT}/clip.mp4")
print("clip.mp4 written")

with open(f"{OUT}/transcript.txt", "w") as f:
    f.write("\n".join(SENTENCES) + "\n")
print("ground truth:", len(SENTENCES), "sentences")
