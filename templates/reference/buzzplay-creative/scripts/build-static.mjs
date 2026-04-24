#!/usr/bin/env node
/**
 * Copy site sources into dist/ for Wrangler ASSETS (sources live at repo root, not under public/).
 */
import { cp, mkdir, readdir, stat } from 'fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const dist = join(root, 'dist');

async function exists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

await mkdir(dist, { recursive: true });

await cp(join(root, 'index.html'), join(dist, 'index.html'));

for (const name of ['src', 'lib']) {
	const from = join(root, name);
	if (await exists(from)) {
		await cp(from, join(dist, name), { recursive: true });
	}
}

const assetsRoot = join(root, 'assets');
if (await exists(assetsRoot)) {
	await cp(assetsRoot, join(dist, 'assets'), { recursive: true });
} else {
	const defaultAssetDirs = ['images', 'audio', 'video', 'fonts', '3d'];
	for (const sub of defaultAssetDirs) {
		await mkdir(join(dist, 'assets', sub), { recursive: true });
	}
}

console.log('build-static: wrote', dist);
