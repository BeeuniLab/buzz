#!/usr/bin/env bun
/**
 * Import fake users from buzz_users.json into local D1 SQLite database.
 *
 * Usage:
 *   bun scripts/import-users.ts
 *   bun scripts/import-users.ts --dry-run
 *   bun scripts/import-users.ts --json ./path/to/users.json
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'bun:sqlite';

const AVATAR_STYLES = [
	'avataaars',
	'adventurer',
	'big-ears',
	'lorelei',
	'micah',
	'notionists',
	'open-peeps',
	'personas',
	'thumbs',
];

interface UserEntry {
	username: string;
	displayName: string;
	email: string;
	bio: string;
	avatarStyle?: string;
}

function generateId(): string {
	return crypto.randomUUID();
}

function getAvatarUrl(username: string, style?: string): string {
	const s = style || AVATAR_STYLES[Math.floor(Math.random() * AVATAR_STYLES.length)];
	return `https://api.dicebear.com/9.x/${s}/svg?seed=${username}`;
}

function findLocalD1Database(): string {
	const d1Dir = join(
		import.meta.dir,
		'../.wrangler/state/v3/d1/miniflare-D1DatabaseObject',
	);

	const files = readdirSync(d1Dir).filter((f) => f.endsWith('.sqlite'));
	if (files.length === 0) {
		throw new Error('No local D1 database found. Run `wrangler dev` first.');
	}

	// Find the one with the most users (the active DB)
	let bestFile = files[0];
	let bestCount = -1;

	for (const file of files) {
		try {
			const db = new Database(join(d1Dir, file), { readonly: true });
			const row = db.query('SELECT count(*) as cnt FROM users').get() as { cnt: number };
			if (row.cnt > bestCount) {
				bestCount = row.cnt;
				bestFile = file;
			}
			db.close();
		} catch {
			// skip non-matching databases
		}
	}

	return join(d1Dir, bestFile);
}

function main() {
	const args = process.argv.slice(2);
	let dryRun = false;
	let jsonPath = join(import.meta.dir, '../../buzz_users/buzz_users.json');

	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
			case '--dry-run':
				dryRun = true;
				break;
			case '--json':
				jsonPath = args[++i];
				break;
			default:
				console.error(`Unknown argument: ${args[i]}`);
				process.exit(1);
		}
	}

	// Read users JSON
	let users: UserEntry[];
	try {
		const raw = readFileSync(jsonPath, 'utf-8');
		users = JSON.parse(raw) as UserEntry[];
	} catch (err) {
		console.error(`Failed to read ${jsonPath}:`, err);
		process.exit(1);
	}

	console.log(`Loaded ${users.length} users from ${jsonPath}`);

	if (dryRun) {
		console.log('[DRY RUN] Would insert:');
		for (const u of users.slice(0, 5)) {
			console.log(`  @${u.username} (${u.displayName}) - ${getAvatarUrl(u.username, u.avatarStyle)}`);
		}
		console.log(`  ... and ${Math.max(0, users.length - 5)} more`);
		return;
	}

	// Find and open database
	const dbPath = findLocalD1Database();
	console.log(`Using database: ${dbPath}`);

	const db = new Database(dbPath);

	// Check existing usernames to avoid duplicates
	const existing = new Set<string>();
	const rows = db.query('SELECT username FROM users WHERE username IS NOT NULL').all() as { username: string }[];
	for (const row of rows) {
		existing.add(row.username);
	}

	const existingEmails = new Set<string>();
	const emailRows = db.query('SELECT email FROM users').all() as { email: string }[];
	for (const row of emailRows) {
		existingEmails.add(row.email);
	}

	const stmt = db.prepare(`
		INSERT INTO users (id, email, username, display_name, avatar_url, bio, provider, provider_id, email_verified, is_active, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, unixepoch(), unixepoch())
	`);

	let inserted = 0;
	let skipped = 0;

	const insertAll = db.transaction(() => {
		for (const user of users) {
			if (existing.has(user.username)) {
				console.log(`  SKIP @${user.username} (username exists)`);
				skipped++;
				continue;
			}
			if (existingEmails.has(user.email)) {
				console.log(`  SKIP @${user.username} (email exists)`);
				skipped++;
				continue;
			}

			const id = generateId();
			const avatarUrl = getAvatarUrl(user.username, user.avatarStyle);

			stmt.run(
				id,
				user.email,
				user.username,
				user.displayName,
				avatarUrl,
				user.bio,
				'seed',                     // provider: mark as seeded accounts
				`seed_${user.username}`,    // provider_id: unique per user
			);

			inserted++;
		}
	});

	insertAll();
	db.close();

	console.log(`\nDone: ${inserted} inserted, ${skipped} skipped`);
}

main();
