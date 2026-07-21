#!/usr/bin/env python3
"""Render assets/banner.svg into a compact, GitHub-safe animated GIF."""

from __future__ import annotations

import io
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SVG_PATH = ROOT / "assets" / "banner.svg"
OUT_GIF = ROOT / "assets" / "banner.gif"

# GitHub content column ~900px; keep source 1200 in SVG, rasterize smaller for GIF.
WIDTH = 900
HEIGHT = 270
FPS = 16
DURATION = 4.2
HOLD_START = 1.2
HOLD_END = 3.1
MAX_MB = 2.2


def ease_out_cubic(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def ease_in_out(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return 0.5 * (1 - math.cos(math.pi * t))


def progress_at(time_s: float) -> dict[str, float]:
    if time_s <= HOLD_START:
        p = ease_out_cubic(time_s / HOLD_START)
        exit_p = 0.0
    elif time_s <= HOLD_END:
        p = 1.0
        exit_p = 0.0
    else:
        p = 1.0
        exit_p = ease_in_out((time_s - HOLD_END) / max(0.01, DURATION - HOLD_END))

    show = p * (1 - exit_p)
    return {
        "title": show,
        "title_y": (1 - show) * 22,
        "hud": show,
        "hud_x": (1 - show) * 36,
        "hud_y": (1 - show) * 10,
        "network": min(1.0, show * 1.15),
        "meters": show,
        "meter_a": show * 276,
        "meter_b": show * 248,
        "scan": 0.08 + 0.05 * math.sin(time_s * 2.0),
        "glow": 0.9 + 0.1 * math.sin(time_s * 1.2),
    }


def build_html(svg_text: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  html, body {{
    margin: 0;
    width: {WIDTH}px;
    height: {HEIGHT}px;
    overflow: hidden;
    background: #0b0c0f;
  }}
  #stage, #stage svg {{
    display: block;
    width: {WIDTH}px;
    height: {HEIGHT}px;
  }}
</style>
</head>
<body>
<div id="stage">{svg_text}</div>
<script>
window.applyMotion = (m) => {{
  const g = (id) => document.getElementById(id);
  const title = g('title-block');
  const hud = g('hud-panel');
  const network = g('network');
  const nodes = g('nodes');
  const meters = g('meters');
  const meterA = g('meter-a');
  const meterB = g('meter-b');
  const scan = g('scanline');
  const glowL = g('glow-left');
  const glowR = g('glow-right');
  if (title) {{
    title.setAttribute('opacity', String(m.title));
    title.setAttribute('transform', `translate(0 ${{m.title_y}})`);
  }}
  if (hud) {{
    hud.setAttribute('opacity', String(m.hud));
    hud.setAttribute('transform', `translate(${{m.hud_x}} ${{m.hud_y}})`);
  }}
  if (network) network.setAttribute('opacity', String(m.network));
  if (nodes) nodes.setAttribute('opacity', String(m.network));
  if (meters) meters.setAttribute('opacity', String(Math.max(0.15, m.meters)));
  if (meterA) meterA.setAttribute('width', String(m.meter_a));
  if (meterB) meterB.setAttribute('width', String(m.meter_b));
  if (scan) {{
    const y = 40 + (280 * (((m.scan - 0.08) / 0.1) + 0.5) % 1);
    scan.setAttribute('y', String(y));
    scan.setAttribute('opacity', String(m.scan));
  }}
  if (glowL) glowL.setAttribute('opacity', String(m.glow));
  if (glowR) glowR.setAttribute('opacity', String(m.glow));
}};
</script>
</body>
</html>
"""


def encode_gif_ffmpeg(frame_dir: Path, out_gif: Path) -> None:
    palette = frame_dir / "palette.png"
    pattern = str(frame_dir / "frame_%04d.png")
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-framerate",
            str(FPS),
            "-i",
            pattern,
            "-vf",
            "palettegen=max_colors=128:stats_mode=diff",
            str(palette),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-framerate",
            str(FPS),
            "-i",
            pattern,
            "-i",
            str(palette),
            "-lavfi",
            "paletteuse=dither=none:diff_mode=rectangle",
            "-loop",
            "0",
            str(out_gif),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def encode_gif_pillow(frames: list[Image.Image], out_gif: Path) -> None:
    duration_ms = int(1000 / FPS)
    quantized = [f.convert("P", palette=Image.ADAPTIVE, colors=128) for f in frames]
    quantized[0].save(
        out_gif,
        save_all=True,
        append_images=quantized[1:],
        duration=duration_ms,
        loop=0,
        optimize=True,
        disposal=2,
    )


def main() -> int:
    if not SVG_PATH.exists():
        print(f"missing {SVG_PATH}", file=sys.stderr)
        return 1

    svg_text = SVG_PATH.read_text(encoding="utf-8")
    if svg_text.lstrip().startswith("<?xml"):
        svg_text = svg_text.split("?>", 1)[-1].strip()

    html = build_html(svg_text)
    frame_count = int(DURATION * FPS)
    frames: list[Image.Image] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page(
            viewport={"width": WIDTH, "height": HEIGHT},
            device_scale_factor=1,
        )
        page.set_content(html, wait_until="domcontentloaded")
        page.wait_for_timeout(60)

        for i in range(frame_count):
            t = (i / frame_count) * DURATION
            page.evaluate("(m) => window.applyMotion(m)", progress_at(t))
            png = page.screenshot(type="png", omit_background=False)
            img = Image.open(io.BytesIO(png)).convert("RGBA")
            bg = Image.new("RGBA", img.size, (11, 12, 15, 255))
            frames.append(Image.alpha_composite(bg, img).convert("RGB"))
            if i % 16 == 0:
                print(f"frame {i + 1}/{frame_count}")

        browser.close()

    OUT_GIF.parent.mkdir(parents=True, exist_ok=True)

    if shutil.which("ffmpeg"):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            for i, frame in enumerate(frames):
                frame.save(tmp_path / f"frame_{i:04d}.png")
            encode_gif_ffmpeg(tmp_path, OUT_GIF)
    else:
        encode_gif_pillow(frames, OUT_GIF)

    size_mb = OUT_GIF.stat().st_size / (1024 * 1024)
    print(f"wrote {OUT_GIF} ({size_mb:.2f} MB, {frame_count} frames @ {FPS}fps)")
    if size_mb > MAX_MB:
        print(f"warning: GIF > {MAX_MB}MB", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
