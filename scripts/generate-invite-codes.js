#!/usr/bin/env node

/**
 * Generate invite codes for buzzplay
 *
 * Usage:
 *   node scripts/generate-invite-codes.js                  # 1 code, local
 *   node scripts/generate-invite-codes.js 10               # 10 codes, local
 *   node scripts/generate-invite-codes.js 10 --remote      # 10 codes, production
 *   node scripts/generate-invite-codes.js 5 --prefix BUZZ  # 5 codes with prefix
 */

import { execSync } from 'child_process';
import crypto from 'crypto';

const args = process.argv.slice(2);
const count = parseInt(args.find(a => !a.startsWith('--')) || '1', 10);
const isRemote = args.includes('--remote');
const prefixArg = args.find(a => a.startsWith('--prefix'));
const prefix = prefixArg ? args[args.indexOf(prefixArg) + 1]?.toUpperCase() || '' : '';

const DB_NAME = 'buzz-db';

function generateCode() {
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return prefix ? `${prefix}-${rand}` : rand;
}

function runD1(sql, remote) {
  const flag = remote ? '--remote' : '--local';
  const cmd = `npx wrangler d1 execute ${DB_NAME} ${flag} --command "${sql.replace(/"/g, '\\"')}"`;
  try {
    const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return output;
  } catch (e) {
    console.error(`Failed: ${e.stderr || e.message}`);
    process.exit(1);
  }
}

console.log(`Generating ${count} invite code(s) [${isRemote ? 'PRODUCTION' : 'LOCAL'}]...\n`);

const codes = [];
for (let i = 0; i < count; i++) {
  const code = generateCode();
  const id = crypto.randomUUID();
  codes.push({ id, code });
}

// Batch insert
const values = codes
  .map(c => `('${c.id}', '${c.code}', 1, 0, 1)`)
  .join(', ');
const sql = `INSERT INTO invite_codes (id, code, max_uses, used_count, is_active) VALUES ${values};`;

runD1(sql, isRemote);

console.log('Generated invite codes:');
console.log('─'.repeat(40));
codes.forEach(c => console.log(`  ${c.code}`));
console.log('─'.repeat(40));
console.log(`\nTotal: ${codes.length} code(s), max_uses: 1 each`);
