#!/usr/bin/env bun
/**
 * Import projects from ./examples into BuzzPlay for a specific user.
 *
 * Usage:
 *   bun examples/import-examples.ts --email user@example.com
 *   bun examples/import-examples.ts --email user@example.com --project Elemental-Serenity
 *   bun examples/import-examples.ts --email user@example.com --base-url https://buzzplay.app
 *   bun examples/import-examples.ts --email user@example.com --dry-run
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, relative } from 'node:path';

type Visibility = 'private' | 'public';

interface ImportOptions {
	apiBaseUrl: string;
	assetBaseUrl: string;
	adminKey: string;
	examplesDir: string;
	email?: string;
	userId?: string;
	projects: string[];
	visibility: Visibility;
	dryRun: boolean;
	concurrency: number;
}

interface ProjectPayload {
	slug: string;
	agentId: string;
	projectName: string;
	title: string;
	description: string;
	files: Record<string, string>;
	assets: AssetUpload[];
	cover?: CoverImage;
	rewriteCount: number;
	skipped: string[];
}

interface AssetUpload {
	sourcePath: string;
	storedPath: string;
	b64: string;
	bytes: number;
	bodyBytes: number;
}

interface CoverImage {
	base64: string;
	contentType: string;
	sourcePath: string;
}

interface ImportResult {
	slug: string;
	success: boolean;
	agentId?: string;
	userId?: string;
	error?: string;
	details?: string;
}

const DEFAULTS = {
	apiBaseUrl: process.env.BUZZPLAY_BASE_URL || 'http://localhost:5173',
	adminKey: process.env.ADMIN_IMPORT_KEY || 'dev-import-key',
	examplesDir: import.meta.dir,
	concurrency: 1,
};

const TEXT_EXTENSIONS = new Set([
	'.cjs', '.css', '.frag', '.glsl', '.html', '.js', '.json', '.jsx', '.md',
	'.jsonc', '.mjs', '.sass', '.scss', '.ts', '.tsx', '.txt', '.vert', '.yaml', '.yml',
]);

const TEXT_FILE_PATHS = new Set([
	'src/asset_map',
	'src/config',
]);

const IGNORE_DIRS = new Set([
	'.git',
	'.vite',
	'.wrangler',
	'dist',
	'node_modules',
]);

const IGNORE_FILE_NAMES = new Set([
	'.DS_Store',
	'bun.lockb',
	'package-lock.json',
	'pnpm-lock.yaml',
	'yarn.lock',
]);

const IGNORE_PUBLIC_PREFIXES = [
	'dev/',
	'research/',
];

const IGNORE_PUBLIC_EXTENSIONS = new Set([
	'.blend',
	'.blend1',
]);

const ASSET_BATCH_BODY_BYTES = 8 * 1024 * 1024;

const SANDBOX_DEV_SCRIPT = 'vite --host 0.0.0.0 --port ${PORT:-8001}';
const SANDBOX_PREVIEW_SCRIPT = 'bun run build && vite preview --host 0.0.0.0 --port ${PORT:-8001}';

function createWorkerIndexJs(): string {
	return `export default {
\tasync fetch(request, env) {
\t\treturn env.ASSETS.fetch(request);
\t},
};
`;
}

function createWranglerJsonc(projectName: string, main = 'worker/index.js'): string {
	return JSON.stringify({
		$schema: 'node_modules/wrangler/config-schema.json',
		name: projectName,
		main,
		compatibility_date: '2025-04-24',
		assets: {
			directory: 'dist',
			binding: 'ASSETS',
			not_found_handling: 'single-page-application',
		},
		observability: {
			enabled: true,
		},
	}, null, '\t');
}

function printHelp(): void {
	console.log(`Import BuzzPlay examples.

Options:
  --email <email>             Target BuzzPlay user email
  --user-id <id>              Target user id, alternative to --email
  --project <name>            Import one project; repeat for multiple
  --all                       Import all example projects (default when no --project is passed)
  --base-url <url>            Admin API and asset URL base (default: ${DEFAULTS.apiBaseUrl})
  --api-base-url <url>        Admin API base URL
  --asset-base-url <url>      Public asset URL base, defaults to API base
  --admin-key <key>           X-Admin-Key value (default: env ADMIN_IMPORT_KEY or dev-import-key)
  --examples-dir <path>       Examples directory (default: ${DEFAULTS.examplesDir})
  --public                    Import as public immediately; default is private so user can Post
  --dry-run                   Show what would be imported without writing
  --concurrency <n>           Parallel project imports (default: 1)
  --help                      Show this help
`);
}

function normalizeBaseUrl(url: string): string {
	return url.replace(/\/+$/, '');
}

function parseArgs(argv: string[]): ImportOptions {
	let apiBaseUrl = DEFAULTS.apiBaseUrl;
	let assetBaseUrl = '';
	let adminKey = DEFAULTS.adminKey;
	let examplesDir = DEFAULTS.examplesDir;
	let email: string | undefined;
	let userId: string | undefined;
	const projects: string[] = [];
	let visibility: Visibility = 'private';
	let dryRun = false;
	let concurrency = DEFAULTS.concurrency;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		switch (arg) {
			case '--email':
				email = requireValue(argv, ++i, arg);
				break;
			case '--user-id':
				userId = requireValue(argv, ++i, arg);
				break;
			case '--project':
			case '--example':
				projects.push(requireValue(argv, ++i, arg));
				break;
			case '--all':
				break;
			case '--base-url':
				apiBaseUrl = requireValue(argv, ++i, arg);
				break;
			case '--api-base-url':
				apiBaseUrl = requireValue(argv, ++i, arg);
				break;
			case '--asset-base-url':
				assetBaseUrl = requireValue(argv, ++i, arg);
				break;
			case '--admin-key':
				adminKey = requireValue(argv, ++i, arg);
				break;
			case '--examples-dir':
				examplesDir = requireValue(argv, ++i, arg);
				break;
			case '--public':
				visibility = 'public';
				break;
			case '--dry-run':
				dryRun = true;
				break;
			case '--concurrency': {
				const parsed = Number.parseInt(requireValue(argv, ++i, arg), 10);
				if (!Number.isFinite(parsed) || parsed < 1) {
					throw new Error('--concurrency must be a positive integer');
				}
				concurrency = parsed;
				break;
			}
			case '--help':
			case '-h':
				printHelp();
				process.exit(0);
			default:
				throw new Error(`Unknown argument: ${arg}`);
		}
	}

	if (!email && !userId) {
		throw new Error('Provide --email <email> or --user-id <id>');
	}

	const normalizedApiBaseUrl = normalizeBaseUrl(apiBaseUrl);
	return {
		apiBaseUrl: normalizedApiBaseUrl,
		assetBaseUrl: normalizeBaseUrl(assetBaseUrl || normalizedApiBaseUrl),
		adminKey,
		examplesDir,
		email,
		userId,
		projects,
		visibility,
		dryRun,
		concurrency,
	};
}

function requireValue(argv: string[], index: number, flag: string): string {
	const value = argv[index];
	if (!value || value.startsWith('--')) {
		throw new Error(`${flag} requires a value`);
	}
	return value;
}

async function walkFiles(dir: string, baseDir = dir): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		if (entry.name.startsWith('.') && entry.name !== '.env') {
			if (IGNORE_DIRS.has(entry.name) || entry.name === '.DS_Store') continue;
		}
		if (IGNORE_DIRS.has(entry.name) || IGNORE_FILE_NAMES.has(entry.name)) continue;

		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...await walkFiles(fullPath, baseDir));
			continue;
		}
		if (entry.isFile()) {
			files.push(relative(baseDir, fullPath));
		}
	}

	return files.sort();
}

function isTextProjectFile(relPath: string): boolean {
	if (relPath.startsWith('public/')) return false;
	if (TEXT_FILE_PATHS.has(relPath)) return true;
	return TEXT_EXTENSIONS.has(extname(relPath).toLowerCase());
}

function shouldImportPublicAsset(publicRelPath: string): boolean {
	if (IGNORE_FILE_NAMES.has(basename(publicRelPath))) return false;
	if (IGNORE_PUBLIC_PREFIXES.some(prefix => publicRelPath.startsWith(prefix))) return false;
	if (IGNORE_PUBLIC_EXTENSIONS.has(extname(publicRelPath).toLowerCase())) return false;
	return true;
}

function sanitizePathSegment(segment: string): string {
	const sanitized = segment.replace(/[^a-zA-Z0-9._-]/g, '_');
	return sanitized || 'asset';
}

function uniqueStoredAssetPath(publicRelPath: string, used: Set<string>): string {
	const sanitized = publicRelPath.split('/').map(sanitizePathSegment).join('/');
	let candidate = sanitized;
	let suffix = 2;
	while (used.has(candidate)) {
		const dir = dirname(sanitized);
		const file = basename(sanitized);
		const ext = extname(file);
		const stem = ext ? file.slice(0, -ext.length) : file;
		candidate = `${dir === '.' ? '' : `${dir}/`}${stem}_${suffix}${ext}`;
		suffix++;
	}
	used.add(candidate);
	return candidate;
}

function assetUrl(assetBaseUrl: string, agentId: string, storedPath: string): string {
	const encodedPath = storedPath.split('/').map(encodeURIComponent).join('/');
	return `${assetBaseUrl}/api/projects/${agentId}/assets/file/${encodedPath}`;
}

function contentTypeForPath(filePath: string): string {
	switch (extname(filePath).toLowerCase()) {
		case '.png':
			return 'image/png';
		case '.jpg':
		case '.jpeg':
			return 'image/jpeg';
		case '.webp':
			return 'image/webp';
		case '.gif':
			return 'image/gif';
		default:
			return 'application/octet-stream';
	}
}

async function readCover(projectDir: string): Promise<CoverImage | undefined> {
	const candidates = [
		'cover.webp',
		'cover.png',
		'cover.jpg',
		'thumbnail.webp',
		'thumbnail.png',
		'thumbnail.jpg',
		'elemental_serenity.jpg',
	];

	for (const relPath of candidates) {
		try {
			const buf = await readFile(join(projectDir, relPath));
			return {
				base64: Buffer.from(buf).toString('base64'),
				contentType: contentTypeForPath(relPath),
				sourcePath: relPath,
			};
		} catch {
			// Try next candidate.
		}
	}

	return undefined;
}

function extractTitle(files: Record<string, string>, slug: string): string {
	const html = files['index.html'];
	if (html) {
		const match = html.match(/<title>([^<]+)<\/title>/i);
		if (match?.[1]?.trim()) return match[1].trim();
	}

	const pkg = files['package.json'];
	if (pkg) {
		try {
			const parsed = JSON.parse(pkg) as { name?: string; description?: string };
			if (parsed.description?.trim()) return parsed.description.trim();
			if (parsed.name?.trim()) return titleize(parsed.name);
		} catch {
			// Ignore malformed package metadata.
		}
	}

	return titleize(slug);
}

function titleize(value: string): string {
	return value
		.replace(/[-_]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/\b\w/g, c => c.toUpperCase());
}

function toWranglerName(value: string): string {
	const name = value
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
	return name || 'buzzplay-import';
}

function toImportedProjectName(title: string, agentId: string): string {
	const prefix = title
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 20)
		.replace(/^-+|-+$/g, '') || 'playable';
	const suffix = agentId.replace(/-/g, '').slice(0, 12);
	return `${prefix}-${suffix}`;
}

function patchPackageJson(raw: string): string {
	const pkg = JSON.parse(raw) as {
		scripts?: Record<string, string>;
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	pkg.scripts = {
		...(pkg.scripts || {}),
		dev: SANDBOX_DEV_SCRIPT,
		build: pkg.scripts?.build || 'vite build',
		preview: SANDBOX_PREVIEW_SCRIPT,
		deploy: pkg.scripts?.deploy || 'bun run build && wrangler deploy',
		'cf-typegen': pkg.scripts?.['cf-typegen'] || 'wrangler types',
	};

	const hasWrangler = Boolean(pkg.dependencies?.wrangler || pkg.devDependencies?.wrangler);
	if (!hasWrangler) {
		pkg.devDependencies = {
			...(pkg.devDependencies || {}),
			wrangler: '^4.50.0',
		};
	}

	return `${JSON.stringify(pkg, null, 2)}\n`;
}

function patchViteConfig(raw: string): string {
	let patched = raw;
	if (patched.includes('cloudflare(') && !patched.includes('inspectorPort')) {
		patched = patched.replace(/cloudflare\(\s*\)/g, 'cloudflare({ inspectorPort: false })');
	}

	const serverBlock = [
		'  server: {',
		"    host: '0.0.0.0',",
		'    allowedHosts: true,',
		'    strictPort: true,',
		'  },',
	].join('\n');

	if (/server\s*:\s*\{/.test(patched)) {
		let next = patched;
		if (!next.includes('strictPort')) {
			next = next.replace(/server\s*:\s*\{/, match => `${match}\n\t\t\tstrictPort: true,`);
		}
		if (!next.includes('allowedHosts')) {
			next = next.replace(/server\s*:\s*\{/, match => `${match}\n\t\t\tallowedHosts: true,`);
		}
		if (!next.includes('host:') && !next.includes('host :')) {
			next = next.replace(/server\s*:\s*\{/, match => `${match}\n\t\t\thost: '0.0.0.0',`);
		}
		return next;
	}

	if (/export\s+default\s+defineConfig\(\s*\{/.test(patched)) {
		return patched.replace(/export\s+default\s+defineConfig\(\s*\{/, match => `${match}\n${serverBlock}`);
	}

	if (/export\s+default\s+\{/.test(patched)) {
		return patched.replace(/export\s+default\s+\{/, match => `${match}\n${serverBlock}`);
	}

	return patched;
}

function ensureSandboxPreviewFiles(files: Record<string, string>, slug: string): void {
	if (files['package.json']) {
		files['package.json'] = patchPackageJson(files['package.json']);
	}

	for (const configPath of ['vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.mts']) {
		if (files[configPath]) {
			files[configPath] = patchViteConfig(files[configPath]);
		}
	}

	if (!files['worker/index.js'] && !files['worker/index.ts']) {
		files['worker/index.js'] = createWorkerIndexJs();
	}

	if (!files['wrangler.jsonc'] && !files['wrangler.toml']) {
		const workerMain = files['worker/index.ts'] ? 'worker/index.ts' : 'worker/index.js';
		files['wrangler.jsonc'] = createWranglerJsonc(toWranglerName(slug), workerMain);
	}
}

function rewriteAssetPaths(
	content: string,
	rewrites: Array<{ from: string; to: string }>,
	assetBaseUrl: string,
	agentId: string,
): { content: string; count: number } {
	let next = content;
	let count = 0;

	for (const { from, to } of rewrites) {
		const before = next;
		next = next.split(from).join(to);
		if (before !== next) {
			count += before.split(from).length - 1;
		}
	}

	const dracoBase = `${assetBaseUrl}/api/projects/${agentId}/assets/file/draco/`;
	for (const quote of ["'", '"', '`']) {
		const from = `${quote}/draco/${quote}`;
		const to = `${quote}${dracoBase}${quote}`;
		const before = next;
		next = next.split(from).join(to);
		if (before !== next) {
			count += before.split(from).length - 1;
		}
	}

	return { content: next, count };
}

async function buildProjectPayload(projectDir: string, slug: string, opts: ImportOptions): Promise<ProjectPayload> {
	const agentId = crypto.randomUUID();
	const allFiles = await walkFiles(projectDir);
	const publicFiles = allFiles
		.filter(relPath => relPath.startsWith('public/'))
		.map(relPath => relPath.slice('public/'.length))
		.filter(shouldImportPublicAsset);

	const usedStoredPaths = new Set<string>();
	const assetPathMap = publicFiles.map(publicRelPath => ({
		publicRelPath,
		storedPath: uniqueStoredAssetPath(publicRelPath, usedStoredPaths),
	}));

	const rewrites = assetPathMap
		.map(({ publicRelPath, storedPath }) => ({
			from: `/${publicRelPath}`,
			to: assetUrl(opts.assetBaseUrl, agentId, storedPath),
		}))
		.sort((a, b) => b.from.length - a.from.length);

	const files: Record<string, string> = {};
	let rewriteCount = 0;

	for (const relPath of allFiles.filter(isTextProjectFile)) {
		const raw = await readFile(join(projectDir, relPath), 'utf-8');
		const rewritten = rewriteAssetPaths(raw, rewrites, opts.assetBaseUrl, agentId);
		files[relPath] = rewritten.content;
		rewriteCount += rewritten.count;
	}
	ensureSandboxPreviewFiles(files, slug);

	const assets: AssetUpload[] = [];
	for (const { publicRelPath, storedPath } of assetPathMap) {
		const buf = await readFile(join(projectDir, 'public', publicRelPath));
		const b64 = Buffer.from(buf).toString('base64');
		assets.push({
			sourcePath: `public/${publicRelPath}`,
			storedPath,
			b64,
			bytes: buf.byteLength,
			bodyBytes: b64.length,
		});
	}

	const skipped = allFiles.filter(relPath => {
		if (relPath.startsWith('public/')) {
			return !publicFiles.includes(relPath.slice('public/'.length));
		}
		return !isTextProjectFile(relPath);
	});

	const title = extractTitle(files, slug);
	return {
		slug,
		agentId,
		projectName: toImportedProjectName(title, agentId),
		title,
		description: `Imported BuzzPlay example: ${title}`,
		files,
		assets,
		cover: await readCover(projectDir),
		rewriteCount,
		skipped,
	};
}

async function sendAssetBatch(
	agentId: string,
	files: Record<string, string>,
	syncAssetMap: boolean,
	opts: ImportOptions,
): Promise<{ success: boolean; count: number; error?: string }> {
	const resp = await fetch(`${opts.apiBaseUrl}/api/admin/import-files/${agentId}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Admin-Key': opts.adminKey,
		},
		body: JSON.stringify({ files, syncAssetMap }),
	});

	const text = await resp.text();
	let parsed: { success?: boolean; count?: number; error?: string } = {};
	try {
		parsed = text ? JSON.parse(text) : {};
	} catch {
		parsed = { error: text };
	}

	if (!resp.ok || !parsed.success) {
		return {
			success: false,
			count: 0,
			error: `HTTP ${resp.status}: ${parsed.error || text.slice(0, 240)}`,
		};
	}

	return { success: true, count: parsed.count || 0 };
}

async function uploadAssets(payload: ProjectPayload, opts: ImportOptions): Promise<{ uploaded: number; errors: string[] }> {
	let uploaded = 0;
	const errors: string[] = [];
	let batch: Record<string, string> = {};
	let batchBytes = 0;

	for (let i = 0; i < payload.assets.length; i++) {
		const asset = payload.assets[i];
		const wouldOverflow = batchBytes + asset.bodyBytes > ASSET_BATCH_BODY_BYTES;
		if (wouldOverflow && Object.keys(batch).length > 0) {
			const result = await sendAssetBatch(payload.agentId, batch, false, opts);
			if (result.success) uploaded += result.count;
			else errors.push(result.error || 'asset upload failed');
			batch = {};
			batchBytes = 0;
		}

		batch[asset.storedPath] = asset.b64;
		batchBytes += asset.bodyBytes;
	}

	if (Object.keys(batch).length > 0) {
		const result = await sendAssetBatch(payload.agentId, batch, true, opts);
		if (result.success) uploaded += result.count;
		else errors.push(result.error || 'asset upload failed');
	}

	return { uploaded, errors };
}

async function importProject(payload: ProjectPayload, opts: ImportOptions): Promise<ImportResult> {
	const resp = await fetch(`${opts.apiBaseUrl}/api/admin/import-project`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Admin-Key': opts.adminKey,
		},
		body: JSON.stringify({
			userEmail: opts.email,
			userId: opts.userId,
			agentId: payload.agentId,
			projectName: payload.projectName,
			title: payload.title,
			description: payload.description,
			files: payload.files,
			templateName: 'scratch',
			visibility: opts.visibility,
			framework: 'vite',
			coverBase64: payload.cover?.base64,
			coverContentType: payload.cover?.contentType,
		}),
	});

	const text = await resp.text();
	let parsed: { success?: boolean; agentId?: string; userId?: string; error?: string } = {};
	try {
		parsed = text ? JSON.parse(text) : {};
	} catch {
		parsed = { error: text };
	}

	if (!resp.ok || !parsed.success) {
		return {
			slug: payload.slug,
			success: false,
			agentId: payload.agentId,
			error: `HTTP ${resp.status}: ${parsed.error || text.slice(0, 240)}`,
		};
	}

	const upload = await uploadAssets(payload, opts);
	const details = `${Object.keys(payload.files).length} files, ${upload.uploaded}/${payload.assets.length} assets, ${payload.rewriteCount} path rewrites`;
	if (upload.errors.length > 0) {
		return {
			slug: payload.slug,
			success: false,
			agentId: parsed.agentId || payload.agentId,
			userId: parsed.userId,
			error: upload.errors.join('; '),
			details,
		};
	}

	return {
		slug: payload.slug,
		success: true,
		agentId: parsed.agentId || payload.agentId,
		userId: parsed.userId,
		details,
	};
}

async function listProjects(examplesDir: string, requested: string[]): Promise<string[]> {
	if (requested.length > 0) return requested;

	const entries = await readdir(examplesDir, { withFileTypes: true });
	return entries
		.filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
		.map(entry => entry.name)
		.sort();
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function dryRunProject(slug: string, projectDir: string, opts: ImportOptions): Promise<ImportResult> {
	const payload = await buildProjectPayload(projectDir, slug, opts);
	const assetBytes = payload.assets.reduce((sum, asset) => sum + asset.bytes, 0);
	return {
		slug,
		success: true,
		agentId: payload.agentId,
		details: [
			`${payload.title}`,
			`${Object.keys(payload.files).length} text files`,
			`${payload.assets.length} assets (${formatBytes(assetBytes)})`,
			`${payload.rewriteCount} path rewrites`,
			payload.cover ? `cover ${payload.cover.sourcePath}` : 'no cover',
			`${payload.skipped.length} skipped`,
		].join(' | '),
	};
}

async function ensureProjectDir(path: string): Promise<void> {
	const info = await stat(path);
	if (!info.isDirectory()) {
		throw new Error(`${path} is not a directory`);
	}
}

async function runBatch<T, R>(
	items: T[],
	concurrency: number,
	worker: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = [];
	let next = 0;

	async function runOne(): Promise<void> {
		while (next < items.length) {
			const index = next++;
			results[index] = await worker(items[index]);
		}
	}

	await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runOne));
	return results;
}

async function main(): Promise<void> {
	const opts = parseArgs(process.argv.slice(2));
	const projects = await listProjects(opts.examplesDir, opts.projects);

	console.log(`Examples dir: ${opts.examplesDir}`);
	console.log(`API base URL: ${opts.apiBaseUrl}`);
	console.log(`Asset base URL: ${opts.assetBaseUrl}`);
	console.log(`Target: ${opts.email || opts.userId}`);
	console.log(`Visibility: ${opts.visibility}`);
	if (opts.dryRun) console.log('Dry run: no projects will be imported');
	console.log('');

	const results = await runBatch(projects, opts.concurrency, async (slug) => {
		const projectDir = join(opts.examplesDir, slug);
		try {
			await ensureProjectDir(projectDir);
			if (opts.dryRun) return await dryRunProject(slug, projectDir, opts);

			const payload = await buildProjectPayload(projectDir, slug, opts);
			return await importProject(payload, opts);
		} catch (error) {
			return {
				slug,
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	});

	let ok = 0;
	let failed = 0;
	for (const result of results) {
		if (result.success) {
			ok++;
			console.log(`OK ${result.slug}${result.agentId ? ` -> ${result.agentId}` : ''}${result.details ? ` (${result.details})` : ''}`);
		} else {
			failed++;
			console.log(`FAIL ${result.slug}${result.agentId ? ` -> ${result.agentId}` : ''}: ${result.error}${result.details ? ` (${result.details})` : ''}`);
		}
	}

	console.log('');
	console.log(`Done: ${ok} ok, ${failed} failed`);
	if (failed > 0) process.exitCode = 1;
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
