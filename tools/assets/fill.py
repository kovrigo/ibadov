# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow"]
# ///
"""Paid step: background fills for the two composites, one tile per call.

Each call sends a 1255x941 (4:3) tile of a source composite to an image model
through the board's spend route (LiteLLM chat completions) and saves the raw
answer to prep/. The answer
is never used as is: prepare.py pastes it back only inside the Brief's masks.

Usage: uv run tools/assets/fill.py <tile> [--model M]
  tiles: aerial-left, aerial-right, balcony-left, balcony-right

Cost: $0.134 per call on gemini-3-pro-image. HTTP 402 means the
task's spend cap is reached: stop, no retry. The page build never runs this.
"""
import base64, io, json, os, subprocess, sys, urllib.error, urllib.request
from pathlib import Path
from PIL import Image

ASSETS = Path(__file__).resolve().parents[2] / "src/blocks/images/assets"
TILE_W = 1255  # 4:3 at the frames' 941px height: the closest ratio the edit API takes

KEEP = (
    " Keep everything else exactly as it is: same framing, perspective, colours, "
    "lighting, sharpness and film look. Do not move, resize or redraw anything else. "
    "No text, no letters, no logos, no interface elements, no new people."
)
TILES = {
    "aerial-left": ("aerial.png", 0,
        "This is the left part of a night aerial photograph of Saint Petersburg with "
        "a graphic overlay on top. Remove the whole overlay: the large translucent "
        "glass panel with its circle, dashes, bars and button outline, the thin gold "
        "arcs, the narrow vertical glass strip, the blurred golden light streaks in "
        "the lower part and the small '02 / 03' counter. Under them, continue the "
        "real aerial city at night: rooftops, streets with warm lights, the Neva "
        "river and the dark evening sky, matching the rest of the photo."),
    "aerial-right": ("aerial.png", 1672 - TILE_W,
        "This is the right part of a night aerial photograph of Saint Petersburg "
        "with Saint Isaac's Cathedral and a man in a dark suit and sunglasses. "
        "Remove the graphic overlay only: the translucent tinted glass panel with "
        "thin bright edges behind the man, the thin vertical gold lines near the "
        "right edge, the small dots at the bottom right, any thin gold arc, and the "
        "soft diagonal golden light streaks drawn across the man's dark suit and in "
        "the lower part. "
        "Under them continue the aerial city at night. Keep the man and the "
        "cathedral exactly unchanged."),
    "balcony-left": ("balcony.png", 0,
        "This is the left part of an evening photograph from a stone balcony with "
        "dark columns, a sunset sky and Saint Petersburg. Remove all the text and "
        "interface drawn on top: the spaced name at the top left with the short "
        "line under it, the large headline, the two-line subtitle, the outlined "
        "button with an arrow, and the small circle with a vertical line and the "
        "word at the bottom left. Under them continue the dark stone columns, the "
        "sunset sky with clouds, the setting sun and the distant city lights."),
    "balcony-right": ("balcony.png", 1672 - TILE_W,
        "This is the right part of an evening photograph from a stone balcony: a "
        "man in a dark suit stands in front of a view of Saint Petersburg with "
        "Saint Isaac's Cathedral, the Neva river and a sunset sky. Remove the man "
        "completely, and remove the cathedral with its dome and colonnade, and the "
        "small menu words and line at the top right. Fill the space with what lies "
        "behind them: the sunset sky with clouds, the low distant city skyline with "
        "warm lights, the embankment and the river with reflections, and the stone "
        "balustrade at the bottom."),
}


def worktree_name() -> str:
    top = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip()
    return os.path.basename(top)


def main() -> None:
    tile = sys.argv[1]
    model = sys.argv[sys.argv.index("--model") + 1] if "--model" in sys.argv else "gemini-3-pro-image"
    src_name, x0, task = TILES[tile]
    src = Image.open(ASSETS / "source" / src_name).convert("RGB")
    crop = src.crop((x0, 0, x0 + TILE_W, src.height))
    buf = io.BytesIO()
    crop.save(buf, "PNG")
    # LiteLLM's /images/edits builds a request Vertex rejects (INVALID_ARGUMENT,
    # 2026-10-08), so the edit goes through chat completions with an image in.
    body = {
        "model": model,
        "modalities": ["image", "text"],
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": "Edit this image. " + task + KEEP},
            {"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()}},
        ]}],
    }
    url = f"http://127.0.0.1:41806/spend/v1/{worktree_name()}/litellm/chat/completions"
    req = urllib.request.Request(url, json.dumps(body).encode(), {"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as res:
            cost = res.headers.get("x-litellm-response-cost")
            answer = json.load(res)
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read().decode(errors='replace')[:2000]}")
    images = answer["choices"][0]["message"].get("images") or []
    if not images:
        sys.exit("no image in answer: " + json.dumps(answer)[:2000])
    b64 = images[0]["image_url"]["url"].split(",", 1)[1]
    out = ASSETS / "prep" / f"{src_name.split('.')[0]}-fill-{tile.split('-')[1]}.png"
    Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB").save(out)
    print(f"{out} {Image.open(out).size} model={model} cost={cost}")


if __name__ == "__main__":
    main()
