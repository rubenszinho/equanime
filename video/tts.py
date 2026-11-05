#!/usr/bin/env python3
"""Voices every narration line of record.mjs with OpenAI's TTS.

    python3 tts.py <keyFile> [voiceDir]

Reads the `say("…")` lines from record.mjs, writes one MP3 per line into voiceDir
(default out/voice, named by a hash of voice + instructions + text, so only new or changed
lines are requested again) and voiceDir/durations.json ({text: seconds}), which record.mjs
uses to keep each line on screen as long as it is spoken. The key file holds
OPEN_AI_API_KEY=… (or OPENAI_API_KEY=…); the key is never printed.
"""
import hashlib
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODEL = "gpt-4o-mini-tts"
VOICE = "coral"
INSTRUCTIONS = (
    "Fale em português do Brasil, com sotaque brasileiro natural (paulista), nunca de Portugal. "
    "Tom de narrador de vídeo institucional: calmo, claro, confiante e acolhedor, ritmo moderado. "
    "Pronuncie 'Equânime' como e-KUÂ-ni-me, 'Lattes' como LÁ-tes, 'CNPq' como cê-ene-pê-quê, "
    "'ICMC' letra por letra, 'USP' como uma palavra (úspi), 'LABIC' como LÁ-bic, 'OpenWebUI' como open-web-iú-ái, "
    "'Agents4Gov' como êidjents-for-gáv, 'rubry.ai' como rúbri-ponto-ái, 'PDF' como pê-dê-éfe, 'XML' como xis-eme-éle, 'PUB' como uma palavra (púbi), 'IA' como i-á."
)


def key(path):
    for line in Path(path).read_text().splitlines():
        name, _, value = line.partition("=")
        if name.strip() in ("OPEN_AI_API_KEY", "OPENAI_API_KEY") and value.strip():
            return value.strip().strip('"').strip("'")
    sys.exit("no OPEN_AI_API_KEY in the key file")


def lines():
    source = (ROOT / "record.mjs").read_text(encoding="utf-8")
    found = re.findall(r'r\.say\("((?:[^"\\]|\\.)*)"', source)
    return list(dict.fromkeys(json.loads(f'"{t}"') for t in found))


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def speak(api_key, text, target):
    body = json.dumps({"model": MODEL, "voice": VOICE, "input": text, "instructions": INSTRUCTIONS, "response_format": "mp3"}).encode()
    request = urllib.request.Request("https://api.openai.com/v1/audio/speech", data=body, headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=120) as response:
        target.write_bytes(response.read())


def main(key_file, voice_dir=None):
    voice_dir = Path(voice_dir or ROOT / "out" / "voice")
    voice_dir.mkdir(parents=True, exist_ok=True)
    api_key = key(key_file)
    durations, made = {}, 0
    for text in lines():
        digest = hashlib.sha256(f"{MODEL}|{VOICE}|{INSTRUCTIONS}|{text}".encode()).hexdigest()[:16]
        target = voice_dir / f"{digest}.mp3"
        if not target.exists():
            speak(api_key, text, target)
            made += 1
        durations[text] = {"file": target.name, "seconds": round(duration(target), 3)}
    (voice_dir / "durations.json").write_text(json.dumps(durations, ensure_ascii=False, indent="\t"), encoding="utf-8")
    total = sum(d["seconds"] for d in durations.values())
    print(f"{len(durations)} lines ({made} new), {total:.0f}s of speech")


if __name__ == "__main__":
    main(*sys.argv[1:3])
