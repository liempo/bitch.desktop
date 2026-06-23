"""BITCH glyph dashboard plugin API.

Mounted by Hermes under ``/api/plugins/bitch/`` when this dashboard plugin is
installed as a bundled Hermes plugin. The BITCH desktop client calls the glyph
routes below to generate, list, and sync declarative glyph artifacts.
"""

from __future__ import annotations

import base64
import hashlib
import json
import math
import os
import re
import struct
import zlib
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException  # type: ignore[import-not-found]

router = APIRouter()

ARTIFACT_KIND = "bitch.glyph"
SCHEMA_VERSION = 1
ARTIFACT_DIR = Path("bitch") / "glyph"
GENERATED_DIR = "generated"
CURRENT_FILE = "current.json"
MANIFEST_FILE = "manifest.json"
SCENE_FILE = "glyph.scene.json"
PREVIEW_FILE = "preview.png"
SOURCE_FILE = "source.md"
MAX_JSON_BYTES = 256 * 1024
MAX_PREVIEW_BYTES = 2 * 1024 * 1024
MAX_PROMPT_CHARS = 2_000
CANONICAL_SIZE_PX = 512
SCENE_BOX = 3.2
ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_.-]{0,95}$")

SHAPES = ["icosahedron", "torus", "sphere", "octahedron", "tetrahedron", "ring", "box"]
COLOR_TOKENS = ["foreground", "muted", "primary", "line"]
PREVIEW_COLORS = {
    "foreground": (255, 255, 255, 255),
    "muted": (98, 114, 164, 255),
    "primary": (215, 255, 255, 255),
    "line": (39, 48, 73, 255),
}


def _hermes_home() -> Path:
    """Resolve the active Hermes home directory."""
    try:
        from hermes_constants import get_hermes_home  # type: ignore[import-not-found]

        return Path(get_hermes_home())
    except Exception:
        env_home = os.environ.get("HERMES_HOME")
        if env_home:
            return Path(env_home).expanduser()
        return Path.home() / ".hermes"


def _glyph_dir() -> Path:
    return _hermes_home() / ARTIFACT_DIR


def _generated_dir() -> Path:
    return _glyph_dir() / GENERATED_DIR


def _current_file() -> Path:
    return _glyph_dir() / CURRENT_FILE


def _utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _require_file(path: Path, *, label: str, max_bytes: int) -> bytes:
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail=f"Glyph {label} not found.")

    try:
        size = path.stat().st_size
    except OSError as exc:
        raise HTTPException(
            status_code=500, detail=f"Could not inspect glyph {label}."
        ) from exc

    if size > max_bytes:
        raise HTTPException(status_code=413, detail=f"Glyph {label} is too large.")

    try:
        return path.read_bytes()
    except OSError as exc:
        raise HTTPException(
            status_code=500, detail=f"Could not read glyph {label}."
        ) from exc


def _read_json(path: Path, *, label: str) -> dict[str, Any]:
    payload = _require_file(path, label=label, max_bytes=MAX_JSON_BYTES)
    try:
        parsed = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=422, detail=f"Glyph {label} is not valid JSON."
        ) from exc

    if not isinstance(parsed, dict):
        raise HTTPException(
            status_code=422, detail=f"Glyph {label} must be a JSON object."
        )
    return parsed


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    try:
        temporary.write_text(
            json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        temporary.replace(path)
    except OSError as exc:
        raise HTTPException(
            status_code=500, detail=f"Could not write {path.name}."
        ) from exc


def _write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    try:
        temporary.write_bytes(payload)
        temporary.replace(path)
    except OSError as exc:
        raise HTTPException(
            status_code=500, detail=f"Could not write {path.name}."
        ) from exc


def _read_preview_data_url(path: Path) -> str | None:
    if not path.exists() or not path.is_file():
        return None

    payload = _require_file(path, label="preview", max_bytes=MAX_PREVIEW_BYTES)
    return "data:image/png;base64," + base64.b64encode(payload).decode("ascii")


def _validate_manifest(manifest: dict[str, Any]) -> None:
    schema_version = manifest.get("schemaVersion", manifest.get("schema_version"))
    if schema_version != SCHEMA_VERSION:
        raise HTTPException(
            status_code=422, detail="Glyph manifest schemaVersion must be 1."
        )
    if manifest.get("kind") != ARTIFACT_KIND:
        raise HTTPException(
            status_code=422, detail="Glyph manifest kind must be bitch.glyph."
        )


def _validate_scene(scene: dict[str, Any]) -> None:
    schema_version = scene.get("schemaVersion", scene.get("schema_version"))
    if schema_version != SCHEMA_VERSION:
        raise HTTPException(
            status_code=422, detail="Glyph scene schemaVersion must be 1."
        )
    objects = scene.get("objects")
    if not isinstance(objects, list) or not objects:
        raise HTTPException(
            status_code=422, detail="Glyph scene must contain at least one object."
        )


def _sanitize_prompt(prompt: str) -> str:
    clean = " ".join(prompt.strip().split())
    if not clean:
        raise HTTPException(status_code=400, detail="Glyph prompt is required.")
    if len(clean) > MAX_PROMPT_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"Glyph prompt must be {MAX_PROMPT_CHARS} characters or fewer.",
        )
    return clean


def _slug(value: str, *, fallback: str = "glyph", max_length: int = 36) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    normalized = re.sub(r"-+", "-", normalized)
    return (normalized or fallback)[:max_length].strip("-") or fallback


def _safe_glyph_id(value: str | None) -> str | None:
    if not value:
        return None
    clean = value.strip()
    return clean if ID_PATTERN.match(clean) else None


def _glyph_id_for(prompt: str, created_at: str) -> str:
    digest = hashlib.sha256(f"{created_at}\n{prompt}".encode("utf-8")).hexdigest()[:10]
    stamp = re.sub(r"[^0-9]", "", created_at)[:14]
    return f"{stamp}-{_slug(prompt)}-{digest}"


def _artifact_dir_for(glyph_id: str) -> Path:
    safe_id = _safe_glyph_id(glyph_id)
    if not safe_id:
        raise HTTPException(status_code=404, detail="Glyph id not found.")
    return _generated_dir() / safe_id


def _read_current_id() -> str | None:
    path = _current_file()
    if not path.exists():
        return None
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(parsed, dict):
        return None
    return _safe_glyph_id(
        parsed.get("id") if isinstance(parsed.get("id"), str) else None
    )


def _write_current_id(glyph_id: str) -> None:
    _write_json(_current_file(), {"id": glyph_id, "updatedAt": _utc_now()})


def _glyph_name(prompt: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+", prompt)[:5]
    if not words:
        return "Personal glyph"
    return " ".join(words).title()


def _digest_bytes(prompt: str, glyph_id: str) -> bytes:
    return hashlib.sha256(f"{glyph_id}\n{prompt}".encode("utf-8")).digest()


def _unit(byte: int, *, minimum: float, maximum: float) -> float:
    return minimum + (byte / 255) * (maximum - minimum)


def _rotation(digest: bytes, offset: int) -> list[float]:
    return [
        round(
            _unit(
                digest[(offset + index) % len(digest)],
                minimum=-math.pi,
                maximum=math.pi,
            ),
            4,
        )
        for index in range(3)
    ]


def _position(digest: bytes, offset: int, index: int) -> list[float]:
    spread = 0.38 + index * 0.08
    return [
        round(_unit(digest[offset % len(digest)], minimum=-spread, maximum=spread), 3),
        round(
            _unit(digest[(offset + 1) % len(digest)], minimum=-spread, maximum=spread),
            3,
        ),
        round(_unit(digest[(offset + 2) % len(digest)], minimum=-0.2, maximum=0.2), 3),
    ]


def _build_scene(prompt: str, glyph_id: str) -> dict[str, Any]:
    digest = _digest_bytes(prompt, glyph_id)
    count = 3 + digest[0] % 3
    objects: list[dict[str, Any]] = []

    for index in range(count):
        offset = 1 + index * 5
        shape = SHAPES[digest[offset % len(digest)] % len(SHAPES)]
        color = COLOR_TOKENS[
            (digest[(offset + 1) % len(digest)] + index) % len(COLOR_TOKENS)
        ]
        mode = (
            "edges"
            if shape in {"icosahedron", "octahedron", "tetrahedron", "box"}
            else "wireframe"
        )
        radius = round(
            _unit(digest[(offset + 2) % len(digest)], minimum=0.55, maximum=1.65), 3
        )
        opacity = round(
            _unit(digest[(offset + 3) % len(digest)], minimum=0.42, maximum=0.92), 3
        )
        item: dict[str, Any] = {
            "id": f"{shape}-{index + 1}",
            "type": shape,
            "mode": mode,
            "color": color,
            "opacity": opacity,
            "radius": radius,
            "rotation": _rotation(digest, offset + 4),
            "position": _position(digest, offset + 7, index),
            "telemetry": {"scale": "cpu" if index % 2 == 0 else "memory"},
        }

        if shape == "torus":
            item["tube"] = round(max(0.018, radius * 0.035), 3)
            item["segments"] = 48
        elif shape == "ring":
            item["innerRadius"] = round(radius * 0.68, 3)
            item["outerRadius"] = round(radius, 3)
            item["segments"] = 48
        elif shape == "box":
            item["width"] = round(radius * 1.4, 3)
            item["height"] = round(radius * 1.4, 3)
            item["depth"] = round(radius * 1.4, 3)
        else:
            item["detail"] = 1 if shape in {"icosahedron", "sphere"} else 0

        objects.append(item)

    return {
        "schemaVersion": SCHEMA_VERSION,
        "sceneBox": SCENE_BOX,
        "camera": {"fov": 46, "z": 5.25},
        "animation": {
            "rotation": [
                0.04,
                round(_unit(digest[30], minimum=0.18, maximum=0.52), 3),
                0.06,
            ],
            "speed": round(_unit(digest[31], minimum=0.75, maximum=1.35), 3),
            "telemetryBoost": "cpu" if digest[29] % 2 == 0 else "memory",
        },
        "objects": objects,
    }


def _png_chunk(kind: bytes, payload: bytes) -> bytes:
    return (
        struct.pack(">I", len(payload))
        + kind
        + payload
        + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
    )


def _encode_png(width: int, height: int, pixels: bytearray) -> bytes:
    stride = width * 4
    rows = b"".join(
        b"\x00" + bytes(pixels[row * stride : (row + 1) * stride])
        for row in range(height)
    )
    return b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            _png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)),
            _png_chunk(b"IDAT", zlib.compress(rows, 9)),
            _png_chunk(b"IEND", b""),
        ]
    )


def _blend_pixel(
    pixels: bytearray,
    width: int,
    height: int,
    x: int,
    y: int,
    color: tuple[int, int, int, int],
    opacity: float,
) -> None:
    if x < 0 or y < 0 or x >= width or y >= height:
        return
    index = (y * width + x) * 4
    source_alpha = max(0, min(255, round(color[3] * opacity)))
    if source_alpha == 0:
        return

    dest_alpha = pixels[index + 3]
    out_alpha = source_alpha + (dest_alpha * (255 - source_alpha) // 255)
    if out_alpha == 0:
        return

    for channel in range(3):
        source = color[channel]
        dest = pixels[index + channel]
        pixels[index + channel] = min(
            255,
            round(
                (source * source_alpha + dest * dest_alpha * (255 - source_alpha) / 255)
                / out_alpha
            ),
        )
    pixels[index + 3] = out_alpha


def _draw_brush(
    pixels: bytearray,
    width: int,
    height: int,
    x: int,
    y: int,
    color: tuple[int, int, int, int],
    opacity: float,
    radius: int,
) -> None:
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dx * dx + dy * dy <= radius * radius:
                _blend_pixel(pixels, width, height, x + dx, y + dy, color, opacity)


def _draw_line(
    pixels: bytearray,
    width: int,
    height: int,
    start: tuple[float, float],
    end: tuple[float, float],
    color: tuple[int, int, int, int],
    opacity: float,
    thickness: int,
) -> None:
    x0, y0 = round(start[0]), round(start[1])
    x1, y1 = round(end[0]), round(end[1])
    dx = abs(x1 - x0)
    dy = -abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    error = dx + dy
    radius = max(1, thickness // 2)

    while True:
        _draw_brush(pixels, width, height, x0, y0, color, opacity, radius)
        if x0 == x1 and y0 == y1:
            break
        doubled = 2 * error
        if doubled >= dy:
            error += dy
            x0 += sx
        if doubled <= dx:
            error += dx
            y0 += sy


def _polygon_points(
    cx: float, cy: float, radius: float, count: int, rotation: float
) -> list[tuple[float, float]]:
    return [
        (
            cx + math.cos(rotation + math.tau * index / count) * radius,
            cy + math.sin(rotation + math.tau * index / count) * radius,
        )
        for index in range(count)
    ]


def _draw_polyline(
    pixels: bytearray,
    width: int,
    height: int,
    points: list[tuple[float, float]],
    color: tuple[int, int, int, int],
    opacity: float,
    thickness: int,
    *,
    closed: bool = True,
) -> None:
    if len(points) < 2:
        return
    pairs = zip(points, points[1:], strict=False)
    for start, end in pairs:
        _draw_line(pixels, width, height, start, end, color, opacity, thickness)
    if closed:
        _draw_line(
            pixels, width, height, points[-1], points[0], color, opacity, thickness
        )


def _draw_circle(
    pixels: bytearray,
    width: int,
    height: int,
    cx: float,
    cy: float,
    radius: float,
    color: tuple[int, int, int, int],
    opacity: float,
    thickness: int,
) -> None:
    steps = max(48, round(radius * 0.8))
    points = _polygon_points(cx, cy, radius, steps, 0)
    _draw_polyline(pixels, width, height, points, color, opacity, thickness)


def _build_preview_png(scene: dict[str, Any]) -> bytes:
    width = CANONICAL_SIZE_PX
    height = CANONICAL_SIZE_PX
    pixels = bytearray(width * height * 4)
    raw_objects = scene.get("objects")
    objects = raw_objects if isinstance(raw_objects, list) else []

    for index, item in enumerate(objects):
        if not isinstance(item, dict):
            continue
        color = PREVIEW_COLORS.get(
            str(item.get("color", "foreground")), PREVIEW_COLORS["foreground"]
        )
        raw_opacity = item.get("opacity")
        opacity = float(raw_opacity) if isinstance(raw_opacity, (int, float)) else 0.85
        raw_radius = item.get("radius")
        radius = (
            float(raw_radius) if isinstance(raw_radius, (int, float)) else 1.0
        ) * 64
        raw_position = item.get("position")
        position = raw_position if isinstance(raw_position, list) else [0, 0, 0]
        position_x = (
            position[0]
            if len(position) > 0 and isinstance(position[0], (int, float))
            else 0
        )
        position_y = (
            position[1]
            if len(position) > 1 and isinstance(position[1], (int, float))
            else 0
        )
        x = width / 2 + float(position_x) * 72
        y = height / 2 - float(position_y) * 72
        raw_rotation = item.get("rotation")
        rotation = raw_rotation if isinstance(raw_rotation, list) else [0, 0, 0]
        rotation_z = (
            rotation[2]
            if len(rotation) > 2 and isinstance(rotation[2], (int, float))
            else 0
        )
        angle = float(rotation_z)
        shape = str(item.get("type", "icosahedron"))
        thickness = 3 + index % 3

        if shape in {"ring", "torus"}:
            _draw_circle(pixels, width, height, x, y, radius, color, opacity, thickness)
            inner = radius * (0.68 if shape == "ring" else 0.82)
            _draw_circle(
                pixels,
                width,
                height,
                x,
                y,
                inner,
                color,
                opacity * 0.72,
                max(2, thickness - 1),
            )
        elif shape == "sphere":
            _draw_circle(pixels, width, height, x, y, radius, color, opacity, thickness)
            _draw_circle(
                pixels,
                width,
                height,
                x,
                y,
                radius * 0.62,
                color,
                opacity * 0.42,
                max(2, thickness - 1),
            )
        elif shape == "box":
            points = _polygon_points(x, y, radius * 0.92, 4, angle + math.pi / 4)
            _draw_polyline(pixels, width, height, points, color, opacity, thickness)
        else:
            sides = {"tetrahedron": 3, "octahedron": 4}.get(shape, 6)
            outer = _polygon_points(x, y, radius, sides, angle)
            inner = _polygon_points(x, y, radius * 0.48, sides, angle + math.pi / sides)
            _draw_polyline(pixels, width, height, outer, color, opacity, thickness)
            _draw_polyline(
                pixels,
                width,
                height,
                inner,
                color,
                opacity * 0.54,
                max(2, thickness - 1),
            )
            for start, end in zip(outer, inner, strict=False):
                _draw_line(
                    pixels,
                    width,
                    height,
                    start,
                    end,
                    color,
                    opacity * 0.52,
                    max(2, thickness - 1),
                )

    return _encode_png(width, height, pixels)


def _source_markdown(
    prompt: str, glyph_id: str, manifest: dict[str, Any], scene: dict[str, Any]
) -> str:
    return "\n".join(
        [
            f"# BITCH glyph {glyph_id}",
            "",
            "Generated by the BITCH Hermes dashboard plugin using the same constrained glyph artifact contract as the BITCH glyph skill.",
            "",
            "## Prompt",
            "",
            prompt,
            "",
            "## Manifest",
            "",
            "```json",
            json.dumps(manifest, indent=2, sort_keys=True),
            "```",
            "",
            "## Scene",
            "",
            "```json",
            json.dumps(scene, indent=2, sort_keys=True),
            "```",
            "",
        ]
    )


def _artifact_response(base: Path, *, fallback_id: str | None = None) -> dict[str, Any]:
    manifest = _read_json(base / MANIFEST_FILE, label="manifest")
    scene = _read_json(base / SCENE_FILE, label="scene")

    _validate_manifest(manifest)
    _validate_scene(scene)

    glyph_id = (
        _safe_glyph_id(
            manifest.get("id") if isinstance(manifest.get("id"), str) else None
        )
        or fallback_id
    )
    if glyph_id:
        manifest = {**manifest, "id": glyph_id}

    response: dict[str, Any] = {
        "manifest": manifest,
        "scene": scene,
    }
    if glyph_id:
        response["id"] = glyph_id

    preview_data_url = _read_preview_data_url(base / PREVIEW_FILE)
    if preview_data_url:
        response["previewDataUrl"] = preview_data_url

    return response


def _glyph_summary(base: Path) -> dict[str, Any] | None:
    try:
        manifest = _read_json(base / MANIFEST_FILE, label="manifest")
        _validate_manifest(manifest)
    except HTTPException:
        return None

    glyph_id = _safe_glyph_id(
        manifest.get("id") if isinstance(manifest.get("id"), str) else None
    ) or _safe_glyph_id(base.name)
    if not glyph_id:
        return None

    return {
        "id": glyph_id,
        "name": manifest.get("name")
        if isinstance(manifest.get("name"), str)
        else glyph_id,
        "prompt": manifest.get("prompt")
        if isinstance(manifest.get("prompt"), str)
        else None,
        "createdAt": manifest.get("createdAt")
        if isinstance(manifest.get("createdAt"), str)
        else None,
        "hasPreview": (base / PREVIEW_FILE).exists(),
        "manifest": {**manifest, "id": glyph_id},
    }


def _list_glyph_summaries() -> list[dict[str, Any]]:
    root = _generated_dir()
    if not root.exists():
        return []

    summaries: list[dict[str, Any]] = []
    for child in root.iterdir():
        if not child.is_dir():
            continue
        summary = _glyph_summary(child)
        if summary:
            summaries.append(summary)

    return sorted(
        summaries, key=lambda item: str(item.get("createdAt") or ""), reverse=True
    )


def _current_base() -> tuple[Path, str | None]:
    current_id = _read_current_id()
    if current_id:
        current_base = _artifact_dir_for(current_id)
        if current_base.exists():
            return current_base, current_id

    summaries = _list_glyph_summaries()
    if summaries:
        latest_id = summaries[0]["id"]
        return _artifact_dir_for(latest_id), latest_id

    legacy = _glyph_dir()
    if (legacy / MANIFEST_FILE).exists() and (legacy / SCENE_FILE).exists():
        return legacy, "current"

    raise HTTPException(status_code=404, detail="Glyph artifact not found.")


@router.get("/glyph/generate")
async def generate_glyph(prompt: str) -> dict[str, Any]:
    """Generate and persist a new BITCH glyph artifact, then return its id."""
    clean_prompt = _sanitize_prompt(prompt)
    created_at = _utc_now()
    glyph_id = _glyph_id_for(clean_prompt, created_at)
    base = _artifact_dir_for(glyph_id)
    scene = _build_scene(clean_prompt, glyph_id)
    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": ARTIFACT_KIND,
        "id": glyph_id,
        "name": _glyph_name(clean_prompt),
        "prompt": clean_prompt,
        "scene": SCENE_FILE,
        "preview": PREVIEW_FILE,
        "canonicalSizePx": CANONICAL_SIZE_PX,
        "sceneBox": SCENE_BOX,
        "createdAt": created_at,
    }

    _write_json(base / MANIFEST_FILE, manifest)
    _write_json(base / SCENE_FILE, scene)
    _write_bytes(base / PREVIEW_FILE, _build_preview_png(scene))
    _write_bytes(
        base / SOURCE_FILE,
        _source_markdown(clean_prompt, glyph_id, manifest, scene).encode("utf-8"),
    )
    _write_current_id(glyph_id)

    return {"ok": True, "id": glyph_id, "glyphId": glyph_id}


@router.get("/glyph/list")
async def list_glyphs() -> dict[str, Any]:
    """Return generated glyphs discovered from the Hermes filesystem."""
    glyphs = _list_glyph_summaries()
    glyph_ids = {item["id"] for item in glyphs if isinstance(item.get("id"), str)}
    current_id = _read_current_id()
    if current_id not in glyph_ids:
        current_id = glyphs[0]["id"] if glyphs else None
    return {
        "glyphs": glyphs,
        "items": glyphs,
        "currentId": current_id,
        "current_id": current_id,
    }


@router.get("/glyph/current")
async def get_current_glyph(id: str | None = None) -> dict[str, Any]:
    """Return the current or requested BITCH glyph artifact as declarative data only."""
    if id:
        glyph_id = _safe_glyph_id(id)
        if not glyph_id:
            raise HTTPException(status_code=404, detail="Glyph id not found.")
        base = _artifact_dir_for(glyph_id)
        if not base.exists():
            raise HTTPException(status_code=404, detail="Glyph id not found.")
        return _artifact_response(base, fallback_id=glyph_id)

    base, glyph_id = _current_base()
    return _artifact_response(base, fallback_id=glyph_id)
