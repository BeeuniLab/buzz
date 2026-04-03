#!/usr/bin/env bun
/**
 * Import buzzplays-templates into Buzz, randomly assigned to seed users.
 * Uses a power-law distribution so some users have many apps and most have few.
 *
 * Usage:
 *   bun scripts/import-buzzplays-random.ts --all
 *   bun scripts/import-buzzplays-random.ts --all --dry-run
 *   bun scripts/import-buzzplays-random.ts --all --limit 50
 *   bun scripts/import-buzzplays-random.ts --all --concurrency 3
 *   bun scripts/import-buzzplays-random.ts --all --base-url http://localhost:5173
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import Database from 'bun:sqlite';

// ---- Config ----

const DEFAULTS = {
	baseUrl: 'http://localhost:5173',
	adminKey: 'dev-import-key',
	templatesDir: join(import.meta.dir, '../../buzzplays-templates'),
	concurrency: 3,
};

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

const BINARY_EXTENSIONS = new Set([
	'.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
	'.mp3', '.wav', '.ogg', '.mp4', '.webm',
	'.woff', '.woff2', '.ttf', '.eot',
]);

const ASSET_BATCH_SIZE_BYTES = 5 * 1024 * 1024;

// ---- Types ----

interface SeedUser {
	id: string;
	username: string;
}

interface ImportResult {
	slug: string;
	success: boolean;
	agentId?: string;
	userId?: string;
	error?: string;
}

// ---- Power-law user assignment ----
// Some users get many apps, most get few. Feels more natural.

function buildWeightedUserPool(users: SeedUser[]): SeedUser[] {
	// Assign weights using Zipf-like distribution
	// Top ~10% of users get ~50% of apps
	const shuffled = [...users].sort(() => Math.random() - 0.5);
	const weighted: SeedUser[] = [];

	for (let i = 0; i < shuffled.length; i++) {
		// Weight decreases as rank increases: weight = 1/rank^0.6
		const rank = i + 1;
		const weight = Math.max(1, Math.round(20 / Math.pow(rank, 0.6)));
		for (let j = 0; j < weight; j++) {
			weighted.push(shuffled[i]);
		}
	}

	return weighted;
}

function pickRandomUser(pool: SeedUser[]): SeedUser {
	return pool[Math.floor(Math.random() * pool.length)];
}

// ---- DB helpers ----

function findLocalD1Database(): string {
	const d1Dir = join(
		import.meta.dir,
		'../.wrangler/state/v3/d1/miniflare-D1DatabaseObject',
	);

	const { readdirSync } = require('node:fs');
	const sqliteFiles = readdirSync(d1Dir).filter((f: string) => f.endsWith('.sqlite'));

	let bestFile = sqliteFiles[0];
	let bestCount = -1;

	for (const file of sqliteFiles) {
		try {
			const db = new Database(join(d1Dir, file));
			const row = db.query('SELECT count(*) as cnt FROM users').get() as { cnt: number };
			if (row.cnt > bestCount) {
				bestCount = row.cnt;
				bestFile = file;
			}
			db.close();
		} catch {
			// skip
		}
	}

	return join(d1Dir, bestFile);
}

function loadSeedUsers(dbPath: string): SeedUser[] {
	const db = new Database(dbPath);
	const rows = db.query("SELECT id, username FROM users WHERE provider = 'seed' AND username IS NOT NULL").all() as SeedUser[];
	db.close();
	return rows;
}

async function loadRemoteSeedUsers(): Promise<SeedUser[]> {
	const { execSync } = require('node:child_process');
	const raw = execSync(
		`npx wrangler d1 execute buzz-db --remote --command "SELECT id, username FROM users WHERE provider = 'seed' AND username IS NOT NULL" --json`,
		{ encoding: 'utf-8', cwd: join(import.meta.dir, '..'), timeout: 30000 },
	);
	const parsed = JSON.parse(raw);
	// wrangler --json returns an array of query results
	const results = Array.isArray(parsed) ? parsed[0]?.results : parsed?.results;
	if (!results || !Array.isArray(results)) {
		throw new Error('Failed to parse remote D1 query results');
	}
	return results as SeedUser[];
}

// ---- File helpers (from import-buzzplays.ts) ----

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
			// skip
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
		// no assets directory
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

// ---- API calls ----

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

async function uploadAssetsToR2(
	agentId: string,
	assets: { path: string; b64: string; size: number }[],
	opts: { baseUrl: string; adminKey: string },
): Promise<{ uploaded: number; errors: string[] }> {
	let uploaded = 0;
	const errors: string[] = [];

	let batch: Record<string, string> = {};
	let batchSize = 0;

	for (const asset of assets) {
		if (batchSize + asset.size > ASSET_BATCH_SIZE_BYTES && Object.keys(batch).length > 0) {
			const result = await sendAssetBatch(agentId, batch, opts);
			if (result.success) uploaded += result.count;
			else errors.push(result.error);
			batch = {};
			batchSize = 0;
		}
		batch[asset.path] = asset.b64;
		batchSize += asset.size;
	}

	if (Object.keys(batch).length > 0) {
		const result = await sendAssetBatch(agentId, batch, opts);
		if (result.success) uploaded += result.count;
		else errors.push(result.error);
	}

	return { uploaded, errors };
}

async function importGame(
	slug: string,
	gameDir: string,
	userId: string,
	opts: { baseUrl: string; adminKey: string },
): Promise<ImportResult> {
	const textFiles = await readTextFiles(gameDir);

	if (!textFiles['src/code.html']) {
		return { slug, success: false, error: 'missing src/code.html' };
	}

	const title = extractTitle(textFiles, slug);
	const coverBase64 = await readCoverBase64(gameDir);

	const body = {
		userId,
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
		return { slug, success: false, userId, error: `HTTP ${resp.status}: ${errMsg}` };
	}

	const agentId = result.agentId as string;

	// Upload binary assets
	const assets = await readBinaryAssets(gameDir);
	if (assets.length > 0) {
		const { uploaded, errors } = await uploadAssetsToR2(agentId, assets, opts);
		const assetInfo = ` (${uploaded} assets)`;
		if (errors.length > 0) {
			return { slug, success: true, agentId, userId, error: `${assetInfo} [${errors.length} asset errors]` };
		}
		return { slug, success: true, agentId, userId, error: assetInfo };
	}

	return { slug, success: true, agentId, userId };
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

// ---- Main ----

async function main() {
	const args = process.argv.slice(2);

	let all = false;
	let limit = 0;
	let concurrency = DEFAULTS.concurrency;
	let dryRun = false;
	let remote = false;
	let baseUrl = DEFAULTS.baseUrl;
	let adminKey = DEFAULTS.adminKey;
	let templatesDir = DEFAULTS.templatesDir;
	let skipFile: string | null = null;

	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
			case '--all': all = true; break;
			case '--limit': limit = parseInt(args[++i], 10); break;
			case '--concurrency': concurrency = parseInt(args[++i], 10); break;
			case '--dry-run': dryRun = true; break;
			case '--remote': remote = true; break;
			case '--base-url': baseUrl = args[++i]; break;
			case '--admin-key': adminKey = args[++i]; break;
			case '--templates-dir': templatesDir = args[++i]; break;
			case '--skip-file': skipFile = args[++i]; break;
			default:
				console.error(`Unknown argument: ${args[i]}`);
				process.exit(1);
		}
	}

	if (!all) {
		console.error('Error: specify --all');
		process.exit(1);
	}

	// Load seed users from local or remote DB
	let seedUsers: SeedUser[];
	if (remote) {
		console.log('Loading seed users from remote D1...');
		seedUsers = await loadRemoteSeedUsers();
	} else {
		const dbPath = findLocalD1Database();
		seedUsers = loadSeedUsers(dbPath);
	}
	if (seedUsers.length === 0) {
		console.error('No seed users found. Run import-users.ts first.');
		process.exit(1);
	}
	console.log(`Loaded ${seedUsers.length} seed users from local DB`);

	// Build weighted pool for power-law distribution
	const weightedPool = buildWeightedUserPool(seedUsers);

	// Pre-assign users to games for stats
	let slugs = await listGameDirs(templatesDir);

	// Skip already-imported games
	if (skipFile) {
		const { readFileSync } = require('node:fs');
		const skipSlugs = new Set(
			readFileSync(skipFile, 'utf-8').split('\n').map((s: string) => s.trim()).filter(Boolean)
		);
		const before = slugs.length;
		slugs = slugs.filter((s) => !skipSlugs.has(s));
		console.log(`Skipping ${before - slugs.length} already-imported games (from ${skipFile})`);
	}

	// Shuffle templates for random order
	slugs = slugs.sort(() => Math.random() - 0.5);
	if (limit > 0) slugs = slugs.slice(0, limit);

	// Assign each game to a random user
	const assignments = slugs.map((slug) => ({
		slug,
		user: pickRandomUser(weightedPool),
	}));

	// Print distribution stats
	const userCounts = new Map<string, number>();
	for (const a of assignments) {
		userCounts.set(a.user.username, (userCounts.get(a.user.username) || 0) + 1);
	}
	const sortedCounts = [...userCounts.entries()].sort((a, b) => b[1] - a[1]);
	const activeUsers = sortedCounts.length;
	const usersWithNoApps = seedUsers.length - activeUsers;

	console.log(`\nDistribution for ${slugs.length} games across ${activeUsers} users (${usersWithNoApps} users with 0 apps):`);
	console.log(`  Top 5:  ${sortedCounts.slice(0, 5).map(([u, c]) => `@${u}(${c})`).join(', ')}`);
	console.log(`  Bottom: ${sortedCounts.slice(-3).map(([u, c]) => `@${u}(${c})`).join(', ')}`);
	console.log(`  Median: ${sortedCounts[Math.floor(sortedCounts.length / 2)][1]} apps/user`);
	console.log();

	if (dryRun) {
		console.log('[DRY RUN] Sample assignments:');
		for (const a of assignments.slice(0, 10)) {
			const gameDir = join(templatesDir, a.slug);
			const files = await readTextFiles(gameDir);
			const title = extractTitle(files, a.slug);
			console.log(`  "${title}" -> @${a.user.username}`);
		}
		console.log(`  ... and ${Math.max(0, assignments.length - 10)} more`);
		return;
	}

	console.log(`Importing ${slugs.length} games into ${baseUrl}\n`);

	let successCount = 0;
	let failCount = 0;

	for (let i = 0; i < assignments.length; i += concurrency) {
		const batch = assignments.slice(i, i + concurrency);
		const results = await Promise.all(
			batch.map(({ slug, user }) => {
				const gameDir = join(templatesDir, slug);
				return importGame(slug, gameDir, user.id, { baseUrl, adminKey });
			}),
		);

		for (let j = 0; j < results.length; j++) {
			const r = results[j];
			const idx = i + j + 1;
			const assignedUser = batch[j].user.username;
			if (r.success) {
				successCount++;
				console.log(`[${idx}/${assignments.length}] OK ${r.slug} -> @${assignedUser}${r.error || ''}`);
			} else {
				failCount++;
				console.log(`[${idx}/${assignments.length}] FAIL ${r.slug} -> @${assignedUser}: ${r.error}`);
			}
		}
	}

	console.log(`\nDone: ${successCount} imported, ${failCount} failed`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
