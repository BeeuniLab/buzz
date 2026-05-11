#!/usr/bin/env bun
/**
 * Import legacy Google users into the configured Clerk instance.
 *
 * Usage:
 *   bun scripts/import-local-google-users-to-clerk.ts --dry-run
 *   bun scripts/import-local-google-users-to-clerk.ts --apply
 *   bun scripts/import-local-google-users-to-clerk.ts --apply --email user@example.com
 *   bun scripts/import-local-google-users-to-clerk.ts --remote --dry-run --allow-production
 *   bun scripts/import-local-google-users-to-clerk.ts --remote --apply --allow-production
 */

import { Database } from 'bun:sqlite';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT_DIR = join(import.meta.dir, '..');
const D1_DIR = join(ROOT_DIR, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const DEV_VARS_PATH = join(ROOT_DIR, '.dev.vars');
const CLERK_API_BASE = 'https://api.clerk.com/v1';

type LocalUser = {
	id: string;
	email: string;
	display_name: string;
	avatar_url: string | null;
	provider: string;
	provider_id: string;
	email_verified: number | null;
	clerk_user_id: string | null;
};

type ClerkEmailAddress = {
	id: string;
	email_address?: string;
	verification?: {
		status?: string;
	};
};

type ClerkUser = {
	id: string;
	external_id?: string | null;
	email_addresses?: ClerkEmailAddress[];
};

type ClerkListResponse = ClerkUser[] | {
	data?: ClerkUser[];
};

type ClerkErrorResponse = {
	errors?: Array<{
		code?: string;
		message?: string;
		long_message?: string;
	}>;
};

type Options = {
	apply: boolean;
	allowProduction: boolean;
	dbPath?: string;
	databaseName: string;
	email?: string;
	limit?: number;
	remote: boolean;
};

type D1ExecuteResult<T> = {
	results?: T[];
	success?: boolean;
	error?: string;
};

function parseOptions(): Options {
	const args = process.argv.slice(2);
	const options: Options = {
		apply: false,
		allowProduction: false,
		databaseName: 'buzz-db',
		remote: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		switch (arg) {
			case '--apply':
				options.apply = true;
				break;
			case '--dry-run':
				options.apply = false;
				break;
			case '--remote':
				options.remote = true;
				break;
			case '--allow-production':
				options.allowProduction = true;
				break;
			case '--db':
				options.dbPath = args[++i];
				break;
			case '--database':
				options.databaseName = args[++i] || options.databaseName;
				break;
			case '--email':
				options.email = args[++i]?.toLowerCase();
				break;
			case '--limit':
				options.limit = Number(args[++i]);
				break;
			default:
				if (arg.startsWith('--db=')) {
					options.dbPath = arg.slice('--db='.length);
				} else if (arg.startsWith('--database=')) {
					options.databaseName = arg.slice('--database='.length);
				} else if (arg.startsWith('--email=')) {
					options.email = arg.slice('--email='.length).toLowerCase();
				} else if (arg.startsWith('--limit=')) {
					options.limit = Number(arg.slice('--limit='.length));
				} else {
					throw new Error(`Unknown argument: ${arg}`);
				}
		}
	}

	if (options.limit !== undefined && (!Number.isFinite(options.limit) || options.limit <= 0)) {
		throw new Error('--limit must be a positive number');
	}

	return options;
}

function sqlString(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

function stripAnsi(value: string): string {
	return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function parseWranglerJson<T>(stdout: string): T {
	const clean = stripAnsi(stdout).trim();
	const jsonStart = clean.search(/[\[{]/);
	if (jsonStart < 0) {
		throw new Error(`Wrangler did not return JSON: ${clean.slice(0, 500)}`);
	}

	return JSON.parse(clean.slice(jsonStart)) as T;
}

function executeRemoteD1<T>(databaseName: string, command: string): T[] {
	const result = Bun.spawnSync({
		cmd: [
			'npx',
			'wrangler',
			'd1',
			'execute',
			databaseName,
			'--remote',
			'--json',
			'--command',
			command,
		],
		cwd: ROOT_DIR,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const stdout = new TextDecoder().decode(result.stdout);
	const stderr = new TextDecoder().decode(result.stderr);

	if (result.exitCode !== 0) {
		throw new Error(`Remote D1 command failed:\n${stderr || stdout}`);
	}

	const payload = parseWranglerJson<Array<D1ExecuteResult<T>>>(stdout);
	const failed = payload.find((entry) => entry.success === false);
	if (failed) {
		throw new Error(`Remote D1 query failed: ${failed.error || JSON.stringify(failed)}`);
	}

	return payload.flatMap((entry) => entry.results || []);
}

function parseDevVars(): Record<string, string> {
	const content = readFileSync(DEV_VARS_PATH, 'utf-8');
	const vars: Record<string, string> = {};

	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;
		const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
		if (!match) continue;

		const [, key, rawValue] = match;
		vars[key] = rawValue.replace(/^['"]|['"]$/g, '');
	}

	return vars;
}

function hasTable(db: Database, tableName: string): boolean {
	const row = db
		.query("select name from sqlite_master where type = 'table' and name = ?")
		.get(tableName) as { name: string } | null;
	return !!row;
}

function hasColumn(db: Database, tableName: string, columnName: string): boolean {
	const columns = db.query(`pragma table_info(${tableName})`).all() as Array<{ name: string }>;
	return columns.some((column) => column.name === columnName);
}

function findLocalD1Database(): string {
	if (!existsSync(D1_DIR)) {
		throw new Error(`Local D1 directory not found: ${D1_DIR}`);
	}

	const sqliteFiles = readdirSync(D1_DIR)
		.filter((file) => file.endsWith('.sqlite'))
		.map((file) => join(D1_DIR, file));

	let bestPath = '';
	let bestCount = -1;

	for (const filePath of sqliteFiles) {
		try {
			const db = new Database(filePath, { readonly: true });
			if (!hasTable(db, 'users') || !hasColumn(db, 'users', 'clerk_user_id')) {
				db.close();
				continue;
			}

			const row = db.query('select count(*) as count from users').get() as { count: number };
			db.close();

			if (row.count > bestCount) {
				bestCount = row.count;
				bestPath = filePath;
			}
		} catch {
			// Ignore unrelated sqlite files.
		}
	}

	if (!bestPath) {
		throw new Error(`No compatible local D1 database found in ${D1_DIR}`);
	}

	return bestPath;
}

function loadLocalUsers(dbPath: string, options: Options): LocalUser[] {
	const db = new Database(dbPath, { readonly: true });
	const where = [
		"lower(provider) = 'google'",
		"(deleted_at is null or deleted_at = '')",
		"(clerk_user_id is null or clerk_user_id = '')",
	];
	const params: unknown[] = [];

	if (options.email) {
		where.push('lower(email) = ?');
		params.push(options.email);
	}

	const limit = options.limit ? ` limit ${Math.floor(options.limit)}` : '';
	const rows = db
		.query(
			`
			select
				id,
				lower(email) as email,
				display_name,
				avatar_url,
				provider,
				provider_id,
				email_verified,
				clerk_user_id
			from users
			where ${where.join(' and ')}
			order by created_at asc
			${limit}
		`,
		)
		.all(...params) as LocalUser[];

	db.close();
	return rows;
}

function loadRemoteUsers(options: Options): LocalUser[] {
	const where = [
		"lower(provider) = 'google'",
		"(deleted_at is null or deleted_at = '')",
		"(clerk_user_id is null or clerk_user_id = '')",
	];

	if (options.email) {
		where.push(`lower(email) = ${sqlString(options.email)}`);
	}

	const limit = options.limit ? ` limit ${Math.floor(options.limit)}` : '';
	return executeRemoteD1<LocalUser>(
		options.databaseName,
		`
			select
				id,
				lower(email) as email,
				display_name,
				avatar_url,
				provider,
				provider_id,
				email_verified,
				clerk_user_id
			from users
			where ${where.join(' and ')}
			order by created_at asc
			${limit}
		`,
	);
}

function splitName(displayName: string): { firstName?: string; lastName?: string } {
	const parts = displayName.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return {};
	if (parts.length === 1) return { firstName: parts[0] };
	return {
		firstName: parts[0],
		lastName: parts.slice(1).join(' '),
	};
}

async function clerkRequest<T>(
	secretKey: string,
	path: string,
	init: RequestInit = {},
): Promise<T> {
	const response = await fetch(`${CLERK_API_BASE}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${secretKey}`,
			'Content-Type': 'application/json',
			...init.headers,
		},
	});

	if (!response.ok) {
		let detail = await response.text();
		try {
			const parsed = JSON.parse(detail) as ClerkErrorResponse;
			detail = parsed.errors
				?.map((error) => error.long_message || error.message || error.code)
				.filter(Boolean)
				.join('; ') || detail;
		} catch {
			// Keep raw text.
		}

		throw new Error(`Clerk API ${response.status}: ${detail}`);
	}

	return response.json() as Promise<T>;
}

async function findClerkUserByEmail(secretKey: string, email: string): Promise<ClerkUser | null> {
	const getUsers = (response: ClerkListResponse): ClerkUser[] =>
		Array.isArray(response) ? response : response.data || [];
	const queryParams = new URLSearchParams();
	queryParams.append('email_address', email);
	queryParams.set('limit', '10');

	const exact = await clerkRequest<ClerkListResponse>(secretKey, `/users?${queryParams}`);
	const exactMatch = getUsers(exact).find((user) =>
		user.email_addresses?.some((address) => address.email_address?.toLowerCase() === email),
	) || null;
	if (exactMatch) {
		return exactMatch;
	}

	queryParams.delete('email_address');
	queryParams.set('query', email);
	queryParams.set('limit', '10');

	const queried = await clerkRequest<ClerkListResponse>(secretKey, `/users?${queryParams}`);
	return getUsers(queried).find((user) =>
		user.email_addresses?.some((address) => address.email_address?.toLowerCase() === email),
	) || null;
}

async function createClerkUser(secretKey: string, user: LocalUser): Promise<ClerkUser> {
	const { firstName, lastName } = splitName(user.display_name);
	const body = {
		email_address: [user.email],
		external_id: user.id,
		first_name: firstName,
		last_name: lastName,
		skip_password_requirement: true,
		skip_password_checks: true,
		private_metadata: {
			legacyUserId: user.id,
			legacyProvider: user.provider,
			legacyProviderId: user.provider_id,
		},
		public_metadata: {
			legacyProvider: user.provider,
		},
	};

	try {
		return await clerkRequest<ClerkUser>(secretKey, '/users', {
			method: 'POST',
			body: JSON.stringify(body),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes('email_address is not a valid parameter')) {
			throw new Error(
				[
					message,
					'',
					'This Clerk instance does not currently accept email_address on user creation.',
					'Enable Email address in Clerk Dashboard > User & Authentication > Email, phone, username, then rerun this script.',
				].join('\n'),
			);
		}

		throw error;
	}
}

function updateLocalClerkUserId(dbPath: string, localUserId: string, clerkUserId: string) {
	const db = new Database(dbPath);
	db.query(
		`
			update users
			set clerk_user_id = ?, updated_at = cast(strftime('%s', 'now') as integer)
			where id = ?
		`,
	).run(clerkUserId, localUserId);
	db.close();
}

function updateRemoteClerkUserIds(options: Options, mappings: Array<{ localUserId: string; clerkUserId: string }>) {
	if (mappings.length === 0) {
		return;
	}

	const cases = mappings
		.map(({ localUserId, clerkUserId }) => `when ${sqlString(localUserId)} then ${sqlString(clerkUserId)}`)
		.join('\n');
	const ids = mappings.map(({ localUserId }) => sqlString(localUserId)).join(', ');

	executeRemoteD1(
		options.databaseName,
		`
			update users
			set
				clerk_user_id = case id
					${cases}
					else clerk_user_id
				end,
				updated_at = cast(strftime('%s', 'now') as integer)
			where id in (${ids})
		`,
	);
}

function isEmailVerified(clerkUser: ClerkUser, email: string): boolean {
	return !!clerkUser.email_addresses?.some(
		(address) =>
			address.email_address?.toLowerCase() === email &&
			address.verification?.status === 'verified',
	);
}

async function main() {
	const options = parseOptions();
	const vars = parseDevVars();
	const secretKey = vars.CLERK_SECRET_KEY;
	const publishableKey = vars.VITE_CLERK_PUBLISHABLE_KEY;

	if (!secretKey) {
		throw new Error('CLERK_SECRET_KEY is missing from .dev.vars');
	}

	if (!publishableKey) {
		throw new Error('VITE_CLERK_PUBLISHABLE_KEY is missing from .dev.vars');
	}

	if (!options.allowProduction && (!secretKey.startsWith('sk_test_') || !publishableKey.startsWith('pk_test_'))) {
		throw new Error('Refusing to import into a non-test Clerk instance. Pass --allow-production to override.');
	}

	const dbPath = options.remote ? undefined : options.dbPath || findLocalD1Database();
	const users = options.remote ? loadRemoteUsers(options) : loadLocalUsers(dbPath!, options);

	console.log(options.remote ? `Remote D1: ${options.databaseName}` : `Local D1: ${dbPath}`);
	console.log(`Mode: ${options.apply ? 'apply' : 'dry-run'}`);
	console.log(`Eligible legacy Google users: ${users.length}`);

	if (users.length === 0) {
		return;
	}

	if (!options.apply) {
		for (const user of users) {
			console.log(`  would import ${user.email} (${user.display_name})`);
		}
		return;
	}

	let created = 0;
	let linkedExisting = 0;
	let updatedLocal = 0;
	let warnings = 0;
	const remoteUpdates: Array<{ localUserId: string; clerkUserId: string }> = [];

	for (const user of users) {
		process.stdout.write(`Importing ${user.email}... `);

		let clerkUser = await findClerkUserByEmail(secretKey, user.email);
		if (clerkUser) {
			linkedExisting++;
			process.stdout.write(`found ${clerkUser.id}`);
		} else {
			clerkUser = await createClerkUser(secretKey, user);
			created++;
			process.stdout.write(`created ${clerkUser.id}`);
		}

		if (options.remote) {
			remoteUpdates.push({ localUserId: user.id, clerkUserId: clerkUser.id });
		} else {
			updateLocalClerkUserId(dbPath!, user.id, clerkUser.id);
			updatedLocal++;
		}

		if (!isEmailVerified(clerkUser, user.email)) {
			warnings++;
			console.log(options.remote ? ' (queued, warning: Clerk email is not verified)' : ' (local updated, warning: Clerk email is not verified)');
		} else {
			console.log(options.remote ? ' (queued)' : ' (local updated)');
		}
	}

	if (options.remote) {
		process.stdout.write(`Writing ${remoteUpdates.length} Clerk id(s) back to remote D1... `);
		updateRemoteClerkUserIds(options, remoteUpdates);
		updatedLocal = remoteUpdates.length;
		console.log('done');
	}

	console.log('\nDone');
	console.log(`Created in Clerk: ${created}`);
	console.log(`Found existing in Clerk: ${linkedExisting}`);
	console.log(`Updated local users: ${updatedLocal}`);
	if (warnings > 0) {
		console.log(`Warnings: ${warnings} Clerk email address(es) are not verified`);
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
