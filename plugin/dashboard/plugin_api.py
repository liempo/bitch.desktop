"""BITCH glyph dashboard plugin API.

Mounted by Hermes under ``/api/plugins/bitch/`` when this dashboard plugin is
installed as a bundled Hermes plugin. The BITCH desktop client calls
``GET /api/plugins/bitch/glyph/current`` to sync the latest generated glyph.
"""

from __future__ import annotations

import base64
import json
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

router = APIRouter()

ARTIFACT_KIND = "bitch.glyph"
SCHEMA_VERSION = 1
ARTIFACT_DIR = Path("bitch") / "glyph"
MANIFEST_FILE = "manifest.json"
SCENE_FILE = "glyph.scene.json"
PREVIEW_FILE = "preview.png"
MAX_JSON_BYTES = 256 * 1024
MAX_PREVIEW_BYTES = 2 * 1024 * 1024


def _hermes_home() -> Path:
    """Resolve the active Hermes home directory."""
    try:
        from hermes_constants import get_hermes_home

        return Path(get_hermes_home())
    except Exception:
        env_home = os.environ.get("HERMES_HOME")
        if env_home:
            return Path(env_home).expanduser()
        return Path.home() / ".hermes"


def _glyph_dir() -> Path:
    return _hermes_home() / ARTIFACT_DIR


def _require_file(path: Path, *, label: str, max_bytes: int) -> bytes:
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail=f"Glyph {label} not found.")

    try:
        size = path.stat().st_size
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Could not inspect glyph {label}.") from exc

    if size > max_bytes:
        raise HTTPException(status_code=413, detail=f"Glyph {label} is too large.")

    try:
        return path.read_bytes()
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Could not read glyph {label}.") from exc


def _read_json(path: Path, *, label: str) -> dict[str, Any]:
    payload = _require_file(path, label=label, max_bytes=MAX_JSON_BYTES)
    try:
        parsed = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail=f"Glyph {label} is not valid JSON.") from exc

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=422, detail=f"Glyph {label} must be a JSON object.")
    return parsed


def _read_preview_data_url(path: Path) -> str | None:
    if not path.exists() or not path.is_file():
        return None

    payload = _require_file(path, label="preview", max_bytes=MAX_PREVIEW_BYTES)
    return "data:image/png;base64," + base64.b64encode(payload).decode("ascii")


def _validate_manifest(manifest: dict[str, Any]) -> None:
    schema_version = manifest.get("schemaVersion", manifest.get("schema_version"))
    if schema_version != SCHEMA_VERSION:
        raise HTTPException(status_code=422, detail="Glyph manifest schemaVersion must be 1.")
    if manifest.get("kind") != ARTIFACT_KIND:
        raise HTTPException(status_code=422, detail="Glyph manifest kind must be bitch.glyph.")


def _validate_scene(scene: dict[str, Any]) -> None:
    schema_version = scene.get("schemaVersion", scene.get("schema_version"))
    if schema_version != SCHEMA_VERSION:
        raise HTTPException(status_code=422, detail="Glyph scene schemaVersion must be 1.")
    objects = scene.get("objects")
    if not isinstance(objects, list) or not objects:
        raise HTTPException(status_code=422, detail="Glyph scene must contain at least one object.")


@router.get("/glyph/current")
async def get_current_glyph() -> dict[str, Any]:
    """Return the current BITCH glyph artifact as declarative data only."""
    base = _glyph_dir()
    manifest = _read_json(base / MANIFEST_FILE, label="manifest")
    scene = _read_json(base / SCENE_FILE, label="scene")

    _validate_manifest(manifest)
    _validate_scene(scene)

    response: dict[str, Any] = {
        "manifest": manifest,
        "scene": scene,
    }

    preview_data_url = _read_preview_data_url(base / PREVIEW_FILE)
    if preview_data_url:
        response["previewDataUrl"] = preview_data_url

    return response
