#!/usr/bin/env node

/**
 * Hide/show public apps from default browse surfaces while keeping them searchable.
 *
 * Usage:
 *   node scripts/set-app-browse-hidden.js --remote --hide APP_ID [APP_ID...]
 *   node scripts/set-app-browse-hidden.js --remote --show APP_ID [APP_ID...]
 *   node scripts/set-app-browse-hidden.js --remote --status APP_ID [APP_ID...]
 *
 * Notes:
 *   - --hide sets hidden_from_browse = 1
 *   - --show sets hidden_from_browse = 0
 *   - --status only reads current values
 *   - omit --remote to target the local D1 database
 */

import { execFileSync } from 'node:child_process';

const DB_NAME = 'buzz-db';

function printUsageAndExit(message) {
	if (message) {
		console.error(`\n${message}`);
	}
	console.error(`
Usage:
  node scripts/set-app-browse-hidden.js --remote --hide APP_ID [APP_ID...]
  node scripts/set-app-browse-hidden.js --remote --show APP_ID [APP_ID...]
  node scripts/set-app-browse-hidden.js --remote --status APP_ID [APP_ID...]

Options:
  --remote    Target production D1
  --local     Target local D1 (default)
  --hide      Hide apps from feed/discover default browse
  --show      Restore apps to feed/discover default browse
  --status    Show current hidden_from_browse values
`);
	process.exit(1);
}

function sqlString(value) {
	return `'${String(value).replace(/'/g, "''")}'`;
}

function runD1(sql, remote) {
	const flag = remote ? '--remote' : '--local';
	return execFileSync(
		'npx',
		['wrangler', 'd1', 'execute', DB_NAME, flag, '--command', sql],
		{ encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
	);
}

const args = process.argv.slice(2);
const isRemote = args.includes('--remote');
const modeArgs = ['--hide', '--show', '--status'].filter((arg) => args.includes(arg));

if (modeArgs.length !== 1) {
	printUsageAndExit('Choose exactly one of --hide, --show, or --status.');
}

const mode = modeArgs[0];
const appIds = args.filter((arg) => !arg.startsWith('--'));

if (appIds.length === 0) {
	printUsageAndExit('Provide at least one app id.');
}

const idsSql = appIds.map(sqlString).join(', ');
const selectSql = `
SELECT
	id,
	title,
	visibility,
	status,
	COALESCE(hidden_from_browse, 0) AS hidden_from_browse,
	updated_at
FROM apps
WHERE id IN (${idsSql})
ORDER BY updated_at DESC;
`;

try {
	if (mode === '--status') {
		console.log(runD1(selectSql, isRemote));
		process.exit(0);
	}

	const hiddenValue = mode === '--hide' ? 1 : 0;
	const updateSql = `
UPDATE apps
SET hidden_from_browse = ${hiddenValue}
WHERE id IN (${idsSql});
${selectSql}
`;

	console.log(runD1(updateSql, isRemote));
	console.log(
		mode === '--hide'
			? `Done: ${appIds.length} app id(s) hidden from default browse.`
			: `Done: ${appIds.length} app id(s) restored to default browse.`,
	);
} catch (error) {
	console.error(error.stderr || error.message);
	process.exit(1);
}
