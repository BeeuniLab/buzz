#!/usr/bin/env bun

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'bun:sqlite';

interface AppRow {
	id: string;
	title: string;
	screenshot_url: string | null;
}

interface TemplateDescriptor {
	slug: string;
	title: string;
	coverPath: string;
	codeHtml: string | null;
	packageJson: string | null;
}

interface AgentStateFileEntry {
	fileContents?: string;
}

interface AgentStateSnapshot {
	generatedFilesMap?: Record<string, AgentStateFileEntry | undefined>;
}

const ROOT_DIR = join(import.meta.dir, '..');
const REPO_ROOT = join(ROOT_DIR, '..');
const TEMPLATES_DIR = join(REPO_ROOT, 'buzzplays-templates');
const DO_DIR = join(ROOT_DIR, '.wrangler/state/v3/do/buzz-CodeGeneratorAgent');
const D1_DIR = join(ROOT_DIR, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const BUCKET_NAME = 'buzz-templates';

const dryRun = process.argv.includes('--dry-run');

function readTextIfExists(filePath: string): string | null {
	if (!existsSync(filePath)) return null;
	return readFileSync(filePath, 'utf8');
}

function extractTitle(gameDir: string, slug: string): string {
	try {
		const pkgRaw = readTextIfExists(join(gameDir, 'package.json'));
		if (pkgRaw) {
			const parsed = JSON.parse(pkgRaw) as { description?: string };
			if (parsed.description && parsed.description !== slug) {
				return parsed.description;
			}
		}
	} catch {
		// Ignore malformed package.json and fall through.
	}

	const html = readTextIfExists(join(gameDir, 'index.html'));
	if (html) {
		const match = html.match(/<title>([^<]+)<\/title>/i);
		if (match) return match[1];
	}

	return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function loadTemplates(): Map<string, TemplateDescriptor[]> {
	const grouped = new Map<string, TemplateDescriptor[]>();

	for (const slug of readdirSync(TEMPLATES_DIR)) {
		if (slug.startsWith('.')) continue;
		const gameDir = join(TEMPLATES_DIR, slug);
		if (!statSync(gameDir).isDirectory()) continue;

		const coverPath = join(gameDir, 'assets/images/cover.webp');
		if (!existsSync(coverPath)) continue;

		const title = extractTitle(gameDir, slug);
		const descriptor: TemplateDescriptor = {
			slug,
			title,
			coverPath,
			codeHtml: readTextIfExists(join(gameDir, 'src/code.html')),
			packageJson: readTextIfExists(join(gameDir, 'package.json')),
		};

		const existing = grouped.get(title) ?? [];
		existing.push(descriptor);
		grouped.set(title, existing);
	}

	return grouped;
}

function findLocalD1Database(): string {
	const sqliteFiles = readdirSync(D1_DIR)
		.filter(file => file.endsWith('.sqlite'))
		.map(file => join(D1_DIR, file));

	let bestPath = '';
	let bestCount = -1;

	for (const filePath of sqliteFiles) {
		try {
			const db = new Database(filePath, { readonly: true });
			const row = db.query('select count(*) as count from apps').get() as { count: number } | null;
			db.close();
			const count = row?.count ?? -1;
			if (count > bestCount) {
				bestCount = count;
				bestPath = filePath;
			}
		} catch {
			// Ignore non-app sqlite files.
		}
	}

	if (!bestPath) {
		throw new Error(`No local D1 database found in ${D1_DIR}`);
	}

	return bestPath;
}

function loadApps(dbPath: string): AppRow[] {
	const db = new Database(dbPath, { readonly: true });
	const rows = db.query(`
		select id, title, screenshot_url
		from apps
		where screenshot_url like '%/api/screenshots/%/latest.webp'
	`).all() as AppRow[];
	db.close();
	return rows;
}

function findAgentStatePath(agentId: string): string | null {
	try {
		const output = execFileSync(
			'rg',
			['-a', '-l', '--fixed-strings', agentId, DO_DIR],
			{ encoding: 'utf8' },
		).trim();
		if (!output) return null;
		return output.split('\n')[0] || null;
	} catch {
		return null;
	}
}

function readAgentState(agentId: string): AgentStateSnapshot | null {
	const sqlitePath = findAgentStatePath(agentId);
	if (!sqlitePath) return null;

	try {
		const raw = execFileSync(
			'sqlite3',
			[
				`file:${sqlitePath}?mode=ro&immutable=1`,
				"select state from cf_agents_state where id = 'cf_state_row_id'",
			],
			{ encoding: 'utf8' },
		).trim();
		if (!raw) return null;
		return JSON.parse(raw) as AgentStateSnapshot;
	} catch {
		return null;
	}
}

function resolveTemplateForApp(app: AppRow, candidates: TemplateDescriptor[]): TemplateDescriptor | null {
	if (candidates.length === 1) {
		return candidates[0];
	}

	const state = readAgentState(app.id);
	const generatedFilesMap = state?.generatedFilesMap ?? {};
	const stateCodeHtml = generatedFilesMap['src/code.html']?.fileContents ?? null;
	const statePackageJson = generatedFilesMap['package.json']?.fileContents ?? null;

	if (stateCodeHtml) {
		const byCode = candidates.filter(candidate => candidate.codeHtml === stateCodeHtml);
		if (byCode.length === 1) return byCode[0];
		if (byCode.length > 1) candidates = byCode;
	}

	if (statePackageJson) {
		const byPackage = candidates.filter(candidate => candidate.packageJson === statePackageJson);
		if (byPackage.length === 1) return byPackage[0];
		if (byPackage.length > 1) candidates = byPackage;
	}

	return candidates.length === 1 ? candidates[0] : null;
}

function uploadCover(agentId: string, coverPath: string): void {
	execFileSync(
		'npx',
		[
			'wrangler',
			'r2',
			'object',
			'put',
			`${BUCKET_NAME}/screenshots/${agentId}/latest.webp`,
			'--local',
			'--file',
			coverPath,
			'--content-type',
			'image/webp',
			'--config',
			'wrangler.jsonc',
		],
		{
			cwd: ROOT_DIR,
			stdio: 'pipe',
			encoding: 'utf8',
		},
	);
}

function main(): void {
	const templatesByTitle = loadTemplates();
	const dbPath = findLocalD1Database();
	const apps = loadApps(dbPath);

	let matched = 0;
	let uploaded = 0;
	const unresolved: Array<{ id: string; title: string }> = [];

	for (const app of apps) {
		const candidates = templatesByTitle.get(app.title) ?? [];
		if (candidates.length === 0) {
			unresolved.push({ id: app.id, title: app.title });
			continue;
		}

		const resolved = resolveTemplateForApp(app, candidates);
		if (!resolved) {
			unresolved.push({ id: app.id, title: app.title });
			continue;
		}

		matched++;
		if (!dryRun) {
			uploadCover(app.id, resolved.coverPath);
			uploaded++;
			console.log(`synced ${app.id} <- ${resolved.slug}`);
		}
	}

	console.log('');
	console.log(`apps with latest.webp screenshot url: ${apps.length}`);
	console.log(`resolved covers: ${matched}`);
	console.log(`uploaded to local R2: ${uploaded}`);
	console.log(`unresolved: ${unresolved.length}`);

	if (unresolved.length > 0) {
		console.log('unresolved apps:');
		for (const item of unresolved.slice(0, 20)) {
			console.log(`- ${item.id} | ${item.title}`);
		}
	}

	if (dryRun) {
		console.log('dry run only; no local R2 objects were written');
	}
}

main();
