#!/usr/bin/env python3
"""
Convert crawled Astrocade game data into Buzz template format.

Usage:
    python3 scripts/convert-astrocade.py                     # Full conversion
    python3 scripts/convert-astrocade.py --limit 3           # Test with 3 games
    python3 scripts/convert-astrocade.py --skip-assets        # Skip asset downloads
    python3 scripts/convert-astrocade.py --force              # Overwrite existing
"""

import argparse
import asyncio
import gzip
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.parse
from pathlib import Path

try:
    import aiohttp
except ImportError:
    print("Installing aiohttp...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "aiohttp"])
    import aiohttp

# Paths
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
INPUT_DIR = PROJECT_ROOT.parent / "game_data" / "astrocade-templates"
OUTPUT_DIR = PROJECT_ROOT.parent / "buzzplays-templates"
TEMPLATE_REF = PROJECT_ROOT / "templates" / "reference" / "buzzplay-creative"

# Files to copy from template reference
TEMPLATE_COPY_FILES = [
    ("lib/host-stub.js", "lib/host-stub.js"),
    ("worker/host.ts", "worker/host.ts"),
    ("scripts/build-static.mjs", "scripts/build-static.mjs"),
]

# Semaphore for concurrent downloads
DOWNLOAD_SEM = asyncio.Semaphore(20)

# Audio file extensions -> route to assets/audio/ instead of assets/images/
AUDIO_EXTS = {'.mp3', '.ogg', '.wav', '.m4a', '.aac', '.flac', '.opus'}

INDEX_HTML = """\
<!DOCTYPE html>
<html lang="en">
<head>
\t<meta charset="UTF-8" />
\t<meta name="viewport" content="width=device-width, initial-scale=1.0" />
\t<title>{title}</title>
\t<style>
\t\t* {{ margin: 0; padding: 0; }}
\t\thtml, body {{ width: 100%; height: 100%; overflow: hidden; }}
\t\tiframe {{ width: 100%; height: 100%; border: none; }}
\t</style>
</head>
<body>
\t<iframe src="src/code.html" allow="autoplay; fullscreen; pointer-lock"></iframe>
</body>
</html>
"""


def convert_cover(src_png: Path, dst_webp: Path) -> bool:
    """Convert cover_generated.png to WebP."""
    try:
        result = subprocess.run(
            ['cwebp', '-q', '85', str(src_png), '-o', str(dst_webp)],
            capture_output=True, timeout=30
        )
        if result.returncode == 0:
            return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    try:
        from PIL import Image
        img = Image.open(src_png)
        img.save(dst_webp, 'WebP', quality=85)
        return True
    except ImportError:
        pass
    # Fallback: copy PNG with .webp extension (browsers handle it)
    shutil.copy2(src_png, dst_webp)
    return True


def asset_subdir(ext: str) -> str:
    """Return the asset subdirectory based on file extension."""
    return "audio" if ext.lower() in AUDIO_EXTS else "images"


def slugify(text: str) -> str:
    """Convert text to URL-safe slug."""
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '-', text)
    text = text.strip('-')
    return text[:80] if text else ''


def extract_slug_and_ulid(dirname: str) -> tuple[str, str]:
    """Extract slug and ULID from directory name like 'game-name_01KABCDEF...'."""
    # ULID is 26 chars of base32 (0-9, A-Z excluding I, L, O, U)
    match = re.match(r'^(.+?)_([0-9A-Z]{26})$', dirname)
    if match:
        return match.group(1), match.group(2)
    return dirname, ''


def is_valid_slug(slug: str) -> bool:
    """Check if slug is meaningful (not just underscores/dashes/numbers)."""
    cleaned = re.sub(r'[_\-]', '', slug)
    return len(cleaned) >= 2 and not cleaned.isdigit()


def get_file_ext(url: str) -> str:
    """Extract file extension from URL."""
    parsed = urllib.parse.urlparse(url)
    path = parsed.path
    _, ext = os.path.splitext(path)
    return ext if ext else '.webp'


async def download_file(session: aiohttp.ClientSession, url: str, dest: Path) -> bool:
    """Download a file with semaphore limiting."""
    async with DOWNLOAD_SEM:
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status != 200:
                    return False
                dest.parent.mkdir(parents=True, exist_ok=True)
                with open(dest, 'wb') as f:
                    async for chunk in resp.content.iter_chunked(8192):
                        f.write(chunk)
                return True
        except Exception:
            return False


async def download_cdn_context(session: aiohttp.ClientSession, url: str) -> dict | None:
    """Download and decompress CDN context JSON."""
    async with DOWNLOAD_SEM:
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=60)) as resp:
                if resp.status != 200:
                    return None
                raw = await resp.read()
                if raw[:2] == b'\x1f\x8b':
                    raw = gzip.decompress(raw)
                return json.loads(raw)
        except Exception:
            return None


def inject_host_stub(html: str) -> str:
    """Inject host-stub.js script tag after <head>."""
    stub_tag = '<script src="../lib/host-stub.js"></script>'
    if stub_tag in html:
        return html

    # Insert after <head> or <head ...>
    match = re.search(r'(<head[^>]*>)', html, re.IGNORECASE)
    if match:
        insert_pos = match.end()
        return html[:insert_pos] + '\n\t' + stub_tag + html[insert_pos:]

    # Fallback: insert at very beginning
    return stub_tag + '\n' + html


def create_package_json(slug: str, title: str) -> str:
    """Generate package.json for the game."""
    pkg = {
        "name": slug,
        "private": True,
        "version": "1.0.0",
        "description": title,
        "scripts": {
            "dev": "wrangler dev",
            "build": "node scripts/build-static.mjs",
            "deploy": "node scripts/build-static.mjs && wrangler deploy",
            "preview": "node scripts/build-static.mjs && wrangler dev"
        },
        "devDependencies": {
            "@cloudflare/workers-types": "^4.20250109.0",
            "wrangler": "^4.14.0"
        }
    }
    return json.dumps(pkg, indent=2) + '\n'


def create_wrangler_jsonc(slug: str) -> str:
    """Generate wrangler.jsonc for the game."""
    config = {
        "name": slug,
        "main": "worker/host.ts",
        "compatibility_date": "2025-04-24",
        "compatibility_flags": ["nodejs_compat"],
        "assets": {
            "directory": "dist",
            "binding": "ASSETS",
            "not_found_handling": "single-page-application"
        },
        "observability": {
            "enabled": True
        }
    }
    return json.dumps(config, indent='\t') + '\n'


async def convert_game(
    session: aiohttp.ClientSession,
    src_dir: Path,
    dirname: str,
    skip_assets: bool = False,
    output_dir: Path = OUTPUT_DIR,
) -> tuple[str, bool, str]:
    """Convert a single game. Returns (slug, success, message)."""

    # Parse directory name
    slug, ulid = extract_slug_and_ulid(dirname)

    # Read context_meta
    meta_path = src_dir / "context_meta.json"
    code_path = src_dir / "game_code.html"

    if not meta_path.exists() or not code_path.exists():
        return slug, False, "missing context_meta.json or game_code.html"

    with open(meta_path, 'r', encoding='utf-8') as f:
        meta = json.load(f)

    game_metadata = meta.get('game_metadata', {})
    title = game_metadata.get('title', '') or slug
    game_config_raw = meta.get('game_config', '{}')
    cdn_url = meta.get('contextCdnUrl', '')

    # Determine final slug
    if not is_valid_slug(slug):
        slug = slugify(title)
    if not slug:
        slug = f"game-{ulid[:8].lower()}" if ulid else f"game-{dirname[:8]}"

    out_dir = output_dir / slug

    # Skip if already exists
    if out_dir.exists() and (out_dir / "src" / "code.html").exists():
        return slug, True, "already exists, skipped"

    out_dir.mkdir(parents=True, exist_ok=True)

    # Parse game_config
    if isinstance(game_config_raw, str):
        try:
            game_config = json.loads(game_config_raw)
        except (json.JSONDecodeError, TypeError):
            game_config = {}
    else:
        game_config = game_config_raw or {}

    # Download CDN context for asset_map
    asset_map = {}
    if cdn_url:
        ctx = await download_cdn_context(session, cdn_url)
        if ctx:
            asset_map = ctx.get('asset_map', {})

    # Download assets and rewrite URLs
    download_tasks = []
    local_asset_map = {}

    if not skip_assets and asset_map:
        for asset_id, asset_info in asset_map.items():
            url = asset_info.get('url', '')
            if not url:
                local_asset_map[asset_id] = asset_info
                continue

            ext = get_file_ext(url)
            subdir = asset_subdir(ext)
            local_filename = f"{asset_id}{ext}"
            local_path = out_dir / "assets" / subdir / local_filename
            relative_url = f"../assets/{subdir}/{local_filename}"

            # Build local asset entry
            local_entry = dict(asset_info)
            local_entry['url'] = relative_url
            # Also handle animation.url if present
            anim = local_entry.get('animation', {})
            if anim and anim.get('url'):
                anim_ext = get_file_ext(anim['url'])
                anim_subdir = asset_subdir(anim_ext)
                anim_filename = f"{asset_id}_sheet{anim_ext}"
                anim_local_path = out_dir / "assets" / anim_subdir / anim_filename
                local_entry['animation'] = dict(anim)
                local_entry['animation']['url'] = f"../assets/{anim_subdir}/{anim_filename}"
                download_tasks.append((anim['url'], anim_local_path, asset_id + '_sheet'))

            local_asset_map[asset_id] = local_entry
            download_tasks.append((url, local_path, asset_id))
    else:
        local_asset_map = asset_map

    # Execute downloads
    failed_downloads = []
    if download_tasks:
        results = await asyncio.gather(*[
            download_file(session, url, path)
            for url, path, _ in download_tasks
        ])
        for (url, path, aid), success in zip(download_tasks, results):
            if not success:
                failed_downloads.append(aid)
                # Revert to CDN URL for failed downloads
                if aid in local_asset_map:
                    original = asset_map.get(aid.replace('_sheet', ''), {})
                    if aid.endswith('_sheet'):
                        base_id = aid.replace('_sheet', '')
                        if base_id in local_asset_map and 'animation' in local_asset_map[base_id]:
                            orig_anim = asset_map.get(base_id, {}).get('animation', {})
                            if orig_anim:
                                local_asset_map[base_id]['animation']['url'] = orig_anim.get('url', '')
                    elif aid in asset_map:
                        local_asset_map[aid]['url'] = asset_map[aid].get('url', '')

    # Convert cover_generated.png -> cover.webp
    cover_src = src_dir / "cover_generated.png"
    if not cover_src.exists():
        cover_src = src_dir / "cover.webp"  # fallback to original
    if cover_src.exists():
        cover_dest = out_dir / "assets" / "images" / "cover.webp"
        cover_dest.parent.mkdir(parents=True, exist_ok=True)
        if cover_src.suffix == '.png':
            convert_cover(cover_src, cover_dest)
        else:
            shutil.copy2(cover_src, cover_dest)

    # Write src/code.html (inject host-stub)
    src_dir_out = out_dir / "src"
    src_dir_out.mkdir(parents=True, exist_ok=True)

    with open(code_path, 'r', encoding='utf-8') as f:
        code_html = f.read()
    code_html = inject_host_stub(code_html)
    with open(src_dir_out / "code.html", 'w', encoding='utf-8') as f:
        f.write(code_html)

    # Write src/config
    with open(src_dir_out / "config", 'w', encoding='utf-8') as f:
        json.dump(game_config, f, indent=2, ensure_ascii=False)

    # Write src/asset_map
    with open(src_dir_out / "asset_map", 'w', encoding='utf-8') as f:
        json.dump(local_asset_map, f, indent=2, ensure_ascii=False)

    # Write index.html
    with open(out_dir / "index.html", 'w', encoding='utf-8') as f:
        f.write(INDEX_HTML.format(title=title.replace('"', '&quot;')))

    # Copy template skeleton files
    for src_rel, dst_rel in TEMPLATE_COPY_FILES:
        src_file = TEMPLATE_REF / src_rel
        dst_file = out_dir / dst_rel
        if src_file.exists():
            dst_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_file, dst_file)

    # Write package.json and wrangler.jsonc
    with open(out_dir / "package.json", 'w', encoding='utf-8') as f:
        f.write(create_package_json(slug, title))

    with open(out_dir / "wrangler.jsonc", 'w', encoding='utf-8') as f:
        f.write(create_wrangler_jsonc(slug))

    # Create empty asset dirs
    for d in ['audio', 'fonts', '3d']:
        (out_dir / "assets" / d).mkdir(parents=True, exist_ok=True)

    asset_count = len(local_asset_map)
    fail_msg = f", {len(failed_downloads)} download failures" if failed_downloads else ""
    return slug, True, f"ok ({asset_count} assets{fail_msg})"


async def main():
    parser = argparse.ArgumentParser(description='Convert Astrocade games to Buzz template format')
    parser.add_argument('--limit', type=int, default=0, help='Limit number of games to convert (0=all)')
    parser.add_argument('--skip-assets', action='store_true', help='Skip downloading assets')
    parser.add_argument('--force', action='store_true', help='Overwrite existing output directories')
    parser.add_argument('--input', type=str, default=str(INPUT_DIR), help='Input directory')
    parser.add_argument('--output', type=str, default=str(OUTPUT_DIR), help='Output directory')
    args = parser.parse_args()

    input_dir = Path(args.input)
    output_dir = Path(args.output)

    if not input_dir.exists():
        print(f"Error: Input directory not found: {input_dir}")
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    # Collect game directories
    dirs = sorted([
        d for d in os.listdir(input_dir)
        if os.path.isdir(input_dir / d) and not d.startswith('.')
    ])

    if args.limit > 0:
        dirs = dirs[:args.limit]

    print(f"Converting {len(dirs)} games from {input_dir}")
    print(f"Output: {output_dir}")
    if args.skip_assets:
        print("Asset downloads: SKIPPED")
    print()

    success_count = 0
    skip_count = 0
    fail_count = 0

    async with aiohttp.ClientSession() as session:
        for i, dirname in enumerate(dirs, 1):
            src_dir = input_dir / dirname

            if args.force:
                out_slug, _ = extract_slug_and_ulid(dirname)
                out_path = output_dir / out_slug
                if out_path.exists():
                    shutil.rmtree(out_path)

            slug, ok, msg = await convert_game(session, src_dir, dirname, args.skip_assets, output_dir)
            status = "OK" if ok else "FAIL"
            if "skipped" in msg:
                skip_count += 1
                status = "SKIP"
            elif ok:
                success_count += 1
            else:
                fail_count += 1

            print(f"[{i}/{len(dirs)}] {status} {slug}: {msg}")

    print(f"\nDone: {success_count} converted, {skip_count} skipped, {fail_count} failed")


if __name__ == '__main__':
    asyncio.run(main())
