#!/usr/bin/env python3
"""Edits the recorded segments into the Equânime videos.

    python3 build.py <takeDir> <outDir>

Per segment: the fast spans are sped up (with a small "3×" badge) and the narration cues
are mapped onto the edited timeline. Then the versions are joined with crossfades:

    demo          demo + end                 (the site's first-visit modal)
    apresentacao  intro + demo + outro       (with the Agents4Gov context)

Each version comes out clean (.mp4), with burned-in captions (.legendado.mp4), with
.srt/.vtt captions, plus a web cut for the site and the script with timecodes.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FONTS = ROOT.parent / "equanime-api" / "src" / "fonts"
BOLD = FONTS / "PublicSans-Bold.ttf"
XFADE = 0.6
VERSIONS = {
    "demo": ["demo", "end"],
    "apresentacao": ["intro", "demo", "outro"],
}


def run(*args):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *map(str, args)], check=True)


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def pieces(marks):
    """The raw timeline as (start, end, speed) pieces."""
    out, t = [], 0.0
    for f in sorted(marks["fasts"], key=lambda f: f["start"]):
        if f["start"] > t:
            out.append((t, f["start"], 1.0))
        out.append((f["start"], f["end"], float(f["speed"])))
        t = f["end"]
    out.append((t, marks["duration"], 1.0))
    return [p for p in out if p[1] - p[0] > 0.05]


def mapper(parts):
    def edited(t):
        out = 0.0
        for a, b, s in parts:
            if t <= a:
                break
            out += (min(t, b) - a) / s
        return out
    return edited


def edit_segment(take, work, name):
    marks = json.loads((take / f"{name}.marks.json").read_text())
    parts = pieces(marks)
    raw = take / f"{name}.raw.mp4"
    chains, labels = [], []
    for i, (a, b, s) in enumerate(parts):
        chain = f"[0:v]trim=start={a:.3f}:end={b:.3f},setpts=(PTS-STARTPTS)/{s}"
        if s != 1.0:
            chain += f",drawtext=fontfile='{BOLD}':text='{int(s)}×':x=w-tw-46:y=40:fontsize=30:fontcolor=white:box=1:boxcolor=0x14233a@0.72:boxborderw=14"
        chains.append(chain + f",fps=30[v{i}]")
        labels.append(f"[v{i}]")
    graph = ";".join(chains) + ";" + "".join(labels) + f"concat=n={len(parts)}:v=1:a=0[out]"
    out = work / f"{name}.mp4"
    run("-i", raw, "-filter_complex", graph, "-map", "[out]", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", out)
    edited = mapper(parts)
    cues = []
    for c in marks["cues"]:
        end = c["end"] if c["end"] is not None else marks["duration"]
        cues.append({"start": edited(c["start"]), "end": edited(end), "text": c["text"]})
    return out, cues


def join(clips, out):
    """Crossfades clips; returns each clip's start time on the joined timeline."""
    lengths = [duration(c) for c in clips]
    starts, t = [], 0.0
    for i, d in enumerate(lengths):
        starts.append(t)
        t += d - (XFADE if i < len(lengths) - 1 else 0)
    total = t
    inputs = sum((["-i", str(c)] for c in clips), [])
    if len(clips) == 1:
        graph = "[0:v]null[j]"
    else:
        graph, prev = [], "[0:v]"
        for i in range(1, len(clips)):
            label = f"[x{i}]"
            graph.append(f"{prev}[{i}:v]xfade=transition=fade:duration={XFADE}:offset={starts[i]:.3f}{label}")
            prev = label
        graph = ";".join(graph) + f";{prev}null[j]"
    graph += f";[j]fade=t=in:st=0:d=0.5,fade=t=out:st={total - 0.8:.3f}:d=0.8[out]"
    run(*inputs, "-filter_complex", graph, "-map", "[out]", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out)
    return starts, total


def ts(t, sep=","):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02}{sep}{ms:03}"


def write_captions(cues, base, total):
    cues = [dict(c, end=min(c["end"], total)) for c in cues]
    srt = "\n".join(f"{i}\n{ts(c['start'])} --> {ts(c['end'])}\n{c['text']}\n" for i, c in enumerate(cues, 1))
    Path(f"{base}.srt").write_text(srt, encoding="utf-8")
    vtt = "WEBVTT\n\n" + "\n".join(f"{ts(c['start'], '.')} --> {ts(c['end'], '.')}\n{c['text']}\n" for c in cues)
    Path(f"{base}.vtt").write_text(vtt, encoding="utf-8")
    # ASS for burning in: Public Sans on a translucent ink box.
    header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Public Sans,44,&H00FFFFFF,&H00FFFFFF,&H3A3A2314,&H00000000,0,0,0,0,100,100,0,0,3,16,0,2,300,300,58,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    def a(t):
        cs = int(round(t * 100))
        h, cs = divmod(cs, 360000)
        m, cs = divmod(cs, 6000)
        s, cs = divmod(cs, 100)
        return f"{h}:{m:02}:{s:02}.{cs:02}"
    events = "".join(f"Dialogue: 0,{a(c['start'])},{a(c['end'])},Default,,0,0,0,,{c['text']}\n" for c in cues)
    Path(f"{base}.ass").write_text(header + events, encoding="utf-8")
    return cues


def main(take, out):
    take, out = Path(take), Path(out)
    work = out / "work"
    work.mkdir(parents=True, exist_ok=True)
    edited = {}
    needed = {n for v in VERSIONS.values() for n in v}
    for name in sorted(needed):
        if (take / f"{name}.marks.json").exists():
            edited[name] = edit_segment(take, work, name)
            print(f"edited {name}: {duration(edited[name][0]):.1f}s")
    script = ["# Equânime: roteiro de narração (pt-BR)", "", "Gerado por `video/build.py` a partir das falas em `video/record.mjs`.", ""]
    for version, names in VERSIONS.items():
        if not all(n in edited for n in names):
            print(f"skip {version}: missing {[n for n in names if n not in edited]}")
            continue
        base = out / f"equanime-{version}.pt-BR"
        clean = Path(f"{base}.mp4")
        starts, total = join([edited[n][0] for n in names], clean)
        cues = [dict(c, start=c["start"] + s, end=c["end"] + s) for n, s in zip(names, starts) for c in edited[n][1]]
        cues = write_captions(cues, base, total)
        run("-i", clean, "-vf", f"subtitles={Path(f'{base}.ass')}:fontsdir={FONTS}", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", base.parent / f"{base.name}.legendado.mp4")
        if version == "demo":
            # The site's cut: 720p, small, captions as a track.
            run("-i", clean, "-vf", "scale=1280:720:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out / "equanime-demo.web.mp4")
            run("-ss", "3.5", "-i", clean, "-frames:v", "1", "-vf", "scale=1280:720", "-q:v", "3", out / "equanime-demo.poster.jpg")
        script += [f"## {version} ({ts(total, '.')[3:8]})", "", "| Início | Fim | Fala |", "|---|---|---|"]
        script += [f"| {ts(c['start'], '.')[3:10]} | {ts(c['end'], '.')[3:10]} | {c['text']} |" for c in cues]
        script.append("")
        print(f"{version}: {total:.1f}s, {len(cues)} lines")
    (out / "roteiro.pt-BR.md").write_text("\n".join(script), encoding="utf-8")


if __name__ == "__main__":
    main(*sys.argv[1:3])
