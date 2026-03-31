#!/usr/bin/env bun
/**
 * Import buzzplays-templates games into Buzz database via the admin import API.
 *
 * Usage:
 *   bun scripts/import-buzzplays.ts --game a2-soccer-scholar          # Single game
 *   bun scripts/import-buzzplays.ts --all                              # All games
 *   bun scripts/import-buzzplays.ts --all --limit 10                   # First 10
 *   bun scripts/import-buzzplays.ts --all --concurrency 5              # 5 at a time
 *   bun scripts/import-buzzplays.ts --all --dry-run                    # Preview only
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const DEFAULTS = {
    baseUrl: 'http://localhost:5173',
    adminKey: 'dev-import-key',
    userId: '', // must be provided via --user-id
    templatesDir: join(import.meta.dir, '../../buzzplays-templates'),
    concurrency: 3,
};

// Text files to include in the initial project import
const TEXT_FILE_PATTERNS = [
    'index.html',
    'src/code.html',
    'src/config',
    'src/asset_map',
    'lib/host-stub.js',
    'worker/host.ts',
    'package.json',
    'wrangler.jsonc',
    'scripts/build-static.mjs',
];

// Binary asset extensions — uploaded to R2
const BINARY_EXTENSIONS = new Set([
    '.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
    '.mp3', '.wav', '.ogg', '.mp4', '.webm',
    '.woff', '.woff2', '.ttf', '.eot',
]);

// Max batch size for R2 uploads (~5MB per batch to stay safe)
const ASSET_BATCH_SIZE_BYTES = 5 * 1024 * 1024;

interface ImportResult {
    slug: string;
    success: boolean;
    agentId?: string;
    error?: string;
}

async function walkDir(dir: string, base: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const paths: string[] = [];
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            paths.push(...await walkDir(full, base));
        } else {
            paths.push(relative(base, full));
        }
    }
    return paths;
}

async function readTextFiles(gameDir: string): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    for (const pattern of TEXT_FILE_PATTERNS) {
        const filePath = join(gameDir, pattern);
        try {
            const content = await readFile(filePath, 'utf-8');
            files[pattern] = content;
        } catch {
            // File doesn't exist, skip
        }
    }
    return files;
}

async function readBinaryAssets(gameDir: string): Promise<{ path: string; b64: string; size: number }[]> {
    const assets: { path: string; b64: string; size: number }[] = [];
    const assetsDir = join(gameDir, 'assets');
    try {
        const assetPaths = await walkDir(assetsDir, gameDir);
        for (const relPath of assetPaths) {
            const ext = relPath.substring(relPath.lastIndexOf('.')).toLowerCase();
            if (BINARY_EXTENSIONS.has(ext)) {
                const buf = await readFile(join(gameDir, relPath));
                const b64 = Buffer.from(buf).toString('base64');
                assets.push({ path: relPath, b64, size: b64.length });
            }
        }
    } catch {
        // No assets directory
    }
    return assets;
}

function extractTitle(files: Record<string, string>, slug: string): string {
    const pkg = files['package.json'];
    if (pkg) {
        try {
            const parsed = JSON.parse(pkg);
            if (parsed.description && parsed.description !== slug) {
                return parsed.description;
            }
        } catch { /* ignore */ }
    }

    const html = files['index.html'];
    if (html) {
        const match = html.match(/<title>([^<]+)<\/title>/i);
        if (match) return match[1];
    }

    return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function readCoverBase64(gameDir: string): Promise<string | undefined> {
    const coverPath = join(gameDir, 'assets/images/cover.webp');
    try {
        const buf = await readFile(coverPath);
        return Buffer.from(buf).toString('base64');
    } catch {
        return undefined;
    }
}

async function uploadAssetsToR2(
    agentId: string,
    assets: { path: string; b64: string; size: number }[],
    opts: { baseUrl: string; adminKey: string },
): Promise<{ uploaded: number; errors: string[] }> {
    let uploaded = 0;
    const errors: string[] = [];

    // Split into batches by size
    let batch: Record<string, string> = {};
    let batchSize = 0;

    for (const asset of assets) {
        if (batchSize + asset.size > ASSET_BATCH_SIZE_BYTES && Object.keys(batch).length > 0) {
            // Send current batch
            const result = await sendAssetBatch(agentId, batch, opts);
            if (result.success) {
                uploaded += result.count;
            } else {
                errors.push(result.error);
            }
            batch = {};
            batchSize = 0;
        }
        batch[asset.path] = asset.b64;
        batchSize += asset.size;
    }

    // Send remaining
    if (Object.keys(batch).length > 0) {
        const result = await sendAssetBatch(agentId, batch, opts);
        if (result.success) {
            uploaded += result.count;
        } else {
            errors.push(result.error);
        }
    }

    return { uploaded, errors };
}

async function sendAssetBatch(
    agentId: string,
    files: Record<string, string>,
    opts: { baseUrl: string; adminKey: string },
): Promise<{ success: boolean; count: number; error: string }> {
    const resp = await fetch(`${opts.baseUrl}/api/admin/import-files/${agentId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Admin-Key': opts.adminKey,
        },
        body: JSON.stringify({ files }),
    });

    if (!resp.ok) {
        const text = await resp.text();
        return { success: false, count: 0, error: `HTTP ${resp.status}: ${text.slice(0, 200)}` };
    }

    const result = await resp.json() as Record<string, unknown>;
    if (result.success) {
        return { success: true, count: result.count as number, error: '' };
    }
    return { success: false, count: 0, error: String(result.error) };
}

async function importGame(
    slug: string,
    gameDir: string,
    opts: { baseUrl: string; adminKey: string; userId: string },
): Promise<ImportResult> {
    const textFiles = await readTextFiles(gameDir);

    if (!textFiles['src/code.html']) {
        return { slug, success: false, error: 'missing src/code.html' };
    }

    const title = extractTitle(textFiles, slug);
    const coverBase64 = await readCoverBase64(gameDir);

    // Step 1: Import project (text files + cover)
    const body = {
        userId: opts.userId,
        title,
        description: title,
        files: textFiles,
        templateName: 'buzzplay-creative',
        coverBase64,
    };

    const resp = await fetch(`${opts.baseUrl}/api/admin/import-project`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Admin-Key': opts.adminKey,
        },
        body: JSON.stringify(body),
    });

    const result = await resp.json() as Record<string, unknown>;

    if (!resp.ok || !result.success) {
        const errMsg = typeof result.error === 'string'
            ? result.error
            : JSON.stringify(result.error || result);
        return { slug, success: false, error: `HTTP ${resp.status}: ${errMsg}` };
    }

    const agentId = result.agentId as string;

    // Step 2: Upload binary assets to R2
    const assets = await readBinaryAssets(gameDir);
    if (assets.length > 0) {
        const { uploaded, errors } = await uploadAssetsToR2(agentId, assets, opts);
        const assetInfo = ` (${uploaded} assets to R2)`;
        if (errors.length > 0) {
            return { slug, success: true, agentId, error: `${assetInfo} [${errors.length} asset errors]` };
        }
        return { slug, success: true, agentId, error: assetInfo };
    }

    return { slug, success: true, agentId };
}

async function listGameDirs(templatesDir: string): Promise<string[]> {
    const entries = await readdir(templatesDir);
    const dirs: string[] = [];
    for (const entry of entries) {
        if (entry.startsWith('.')) continue;
        const s = await stat(join(templatesDir, entry));
        if (s.isDirectory()) dirs.push(entry);
    }
    return dirs.sort();
}

async function main() {
    const args = process.argv.slice(2);

    let gameSlug: string | null = null;
    let all = false;
    let limit = 0;
    let concurrency = DEFAULTS.concurrency;
    let dryRun = false;
    let baseUrl = DEFAULTS.baseUrl;
    let adminKey = DEFAULTS.adminKey;
    let userId = DEFAULTS.userId;
    let templatesDir = DEFAULTS.templatesDir;

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--game': gameSlug = args[++i]; break;
            case '--all': all = true; break;
            case '--limit': limit = parseInt(args[++i], 10); break;
            case '--concurrency': concurrency = parseInt(args[++i], 10); break;
            case '--dry-run': dryRun = true; break;
            case '--base-url': baseUrl = args[++i]; break;
            case '--admin-key': adminKey = args[++i]; break;
            case '--user-id': userId = args[++i]; break;
            case '--templates-dir': templatesDir = args[++i]; break;
            default:
                console.error(`Unknown argument: ${args[i]}`);
                process.exit(1);
        }
    }

    if (!userId) {
        console.error('Error: --user-id is required');
        process.exit(1);
    }

    if (!gameSlug && !all) {
        console.error('Error: specify --game <slug> or --all');
        process.exit(1);
    }

    let slugs: string[];
    if (gameSlug) {
        slugs = [gameSlug];
    } else {
        slugs = await listGameDirs(templatesDir);
        if (limit > 0) slugs = slugs.slice(0, limit);
    }

    console.log(`Importing ${slugs.length} game(s) into ${baseUrl}`);
    console.log(`User ID: ${userId}`);
    if (dryRun) console.log('DRY RUN - no actual imports');
    console.log();

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < slugs.length; i += concurrency) {
        const batch = slugs.slice(i, i + concurrency);
        const results = await Promise.all(
            batch.map(async (slug) => {
                const gameDir = join(templatesDir, slug);
                if (dryRun) {
                    const files = await readTextFiles(gameDir);
                    const assets = await readBinaryAssets(gameDir);
                    const title = extractTitle(files, slug);
                    return { slug, success: true, error: `[dry-run] ${title} (${Object.keys(files).length} text, ${assets.length} assets)` } as ImportResult;
                }
                return importGame(slug, gameDir, { baseUrl, adminKey, userId });
            }),
        );

        for (const r of results) {
            const idx = i + batch.indexOf(r.slug) + 1;
            if (r.success) {
                successCount++;
                console.log(`[${idx}/${slugs.length}] OK ${r.slug}${r.agentId ? ` -> ${r.agentId}` : ''}${r.error || ''}`);
            } else {
                failCount++;
                console.log(`[${idx}/${slugs.length}] FAIL ${r.slug}: ${r.error}`);
            }
        }
    }

    console.log(`\nDone: ${successCount} imported, ${failCount} failed`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
