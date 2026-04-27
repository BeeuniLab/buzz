#!/usr/bin/env bun
/**
 * Import seed users to a remote buzz instance via admin API.
 *
 * Usage:
 *   bun scripts/import-users-remote.ts --base-url https://your-app.com --admin-key YOUR_KEY
 *   bun scripts/import-users-remote.ts --dry-run
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const AVATAR_STYLES = [
	'avataaars', 'adventurer', 'big-ears', 'lorelei', 'micah',
	'notionists', 'open-peeps', 'personas', 'thumbs',
];

interface UserEntry {
	username: string;
	displayName: string;
	email: string;
	bio: string;
	avatarStyle?: string;
}

function getAvatarUrl(username: string, style?: string): string {
	const s = style || AVATAR_STYLES[Math.floor(Math.random() * AVATAR_STYLES.length)];
	return `https://api.dicebear.com/10.x/${s}/svg?seed=${username}`;
}

const DEFAULTS = {
	baseUrl: 'http://localhost:5173',
	adminKey: 'dev-import-key',
};

const BATCH_SIZE = 20;

async function main() {
	const args = process.argv.slice(2);
	let dryRun = false;
	let baseUrl = DEFAULTS.baseUrl;
	let adminKey = DEFAULTS.adminKey;
	let jsonPath = join(import.meta.dir, '../../buzz_users/buzz_users.json');

	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
			case '--dry-run': dryRun = true; break;
			case '--base-url': baseUrl = args[++i]; break;
			case '--admin-key': adminKey = args[++i]; break;
			case '--json': jsonPath = args[++i]; break;
			default:
				console.error(`Unknown argument: ${args[i]}`);
				process.exit(1);
		}
	}

	const users: UserEntry[] = JSON.parse(readFileSync(jsonPath, 'utf-8'));
	console.log(`Loaded ${users.length} users from ${jsonPath}`);
	console.log(`Target: ${baseUrl}`);

	// Prepare payload with avatar URLs
	const prepared = users.map((u) => ({
		username: u.username,
		displayName: u.displayName,
		email: u.email,
		bio: u.bio,
		avatarUrl: getAvatarUrl(u.username, u.avatarStyle),
	}));

	if (dryRun) {
		console.log('\n[DRY RUN] Would import:');
		for (const u of prepared.slice(0, 5)) {
			console.log(`  @${u.username} (${u.displayName}) - ${u.avatarUrl}`);
		}
		console.log(`  ... and ${Math.max(0, prepared.length - 5)} more`);
		return;
	}

	// Send in batches to avoid request size limits
	let totalInserted = 0;
	let totalSkipped = 0;

	for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
		const batch = prepared.slice(i, i + BATCH_SIZE);
		const batchNum = Math.floor(i / BATCH_SIZE) + 1;
		const totalBatches = Math.ceil(prepared.length / BATCH_SIZE);

		process.stdout.write(`Batch ${batchNum}/${totalBatches} (${batch.length} users)... `);

		const resp = await fetch(`${baseUrl}/api/admin/import-users`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Admin-Key': adminKey,
			},
			body: JSON.stringify({ users: batch }),
		});

		if (!resp.ok) {
			const text = await resp.text();
			console.error(`FAILED (${resp.status}): ${text}`);
			continue;
		}

		const result = await resp.json() as {
			success: boolean;
			inserted: number;
			skipped: number;
			results: Array<{ username: string; id?: string; error?: string }>;
		};

		totalInserted += result.inserted;
		totalSkipped += result.skipped;
		console.log(`${result.inserted} inserted, ${result.skipped} skipped`);

		// Log errors
		for (const r of result.results) {
			if (r.error) {
				console.log(`  SKIP @${r.username}: ${r.error}`);
			}
		}
	}

	console.log(`\nDone: ${totalInserted} inserted, ${totalSkipped} skipped (total: ${prepared.length})`);
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
