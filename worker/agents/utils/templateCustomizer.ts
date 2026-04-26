import { modify, applyEdits } from 'jsonc-parser';

export interface TemplateCustomizationOptions {
    projectName: string;
    commandsHistory: string[];
}

export interface CustomizedTemplateFiles {
    'package.json': string;
    'wrangler.jsonc'?: string;
    '.bootstrap.js': string;
    '.gitignore': string;
}

/**
 * Customize all template configuration files
 * - Updates package.json with project name and prepare script
 * - Updates wrangler.jsonc with project name (if exists)
 * - Generates .bootstrap.js script
 * - Updates .gitignore to exclude bootstrap marker
 */
export function customizeTemplateFiles(
    templateFiles: Record<string, string>,
    options: TemplateCustomizationOptions
): Partial<CustomizedTemplateFiles> {
    const customized: Partial<CustomizedTemplateFiles> = {};

    // 1. Customize package.json
    if (templateFiles['package.json']) {
        customized['package.json'] = customizePackageJson(
            templateFiles['package.json'],
            options.projectName
        );
    }

    // 2. Customize wrangler.jsonc
    if (templateFiles['wrangler.jsonc']) {
        customized['wrangler.jsonc'] = customizeWranglerJsonc(
            templateFiles['wrangler.jsonc'],
            options.projectName
        );
    }

    customized['.bootstrap.js'] = generateBootstrapScript(
        options.projectName,
        options.commandsHistory
    );

    customized['.gitignore'] = updateGitignore(
        templateFiles['.gitignore'] || ''
    );

    return customized;
}

/**
 * Update package.json with project name
 */
export function customizePackageJson(
    content: string,
    projectName: string,
    opts?: { skipPrepare?: boolean }
): string {
    const pkg = JSON.parse(content);
    pkg.name = projectName;
    if (!opts?.skipPrepare) {
        pkg.scripts = pkg.scripts || {};
        pkg.scripts.prepare = 'bun .bootstrap.js || true';
    }
    return JSON.stringify(pkg, null, 2);
}

export function generateBootstrapScript(projectName: string, commands: string[]): string {
    const safeProjectName = JSON.stringify(projectName);
    const safeCommands = JSON.stringify(commands, null, 4);

    return `#!/usr/bin/env bun
/**
 * Auto-generated bootstrap script
 * Runs once after git clone to setup project correctly
 * This file will self-delete after successful execution
 */

const fs = require('fs');
const { execSync } = require('child_process');

const PROJECT_NAME = ${safeProjectName};
const BOOTSTRAP_MARKER = '.bootstrap-complete';

if (fs.existsSync(BOOTSTRAP_MARKER)) {
    console.log('Bootstrap already completed');
    process.exit(0);
}

console.log('Running first-time project setup...\\n');

try {
    updatePackageJson();
    updateWranglerJsonc();
    runSetupCommands();
    fs.writeFileSync(BOOTSTRAP_MARKER, new Date().toISOString());
    fs.unlinkSync(__filename);
    console.log('\\nBootstrap complete! Project ready.');
} catch (error) {
    console.error('Bootstrap failed:', error.message);
    console.log('You may need to manually update package.json and wrangler.jsonc');
    process.exit(1);
}

function updatePackageJson() {
    try {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        pkg.name = PROJECT_NAME;

        if (pkg.scripts && pkg.scripts.prepare) {
            delete pkg.scripts.prepare;
        }

        fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
        console.log('Updated package.json with project name: ' + PROJECT_NAME);
    } catch (error) {
        console.error('Failed to update package.json:', error.message);
        throw error;
    }
}

function updateWranglerJsonc() {
    if (!fs.existsSync('wrangler.jsonc')) {
        console.log('wrangler.jsonc not found, skipping');
        return;
    }

    try {
        let content = fs.readFileSync('wrangler.jsonc', 'utf8');
        content = content.replace(/"name"\\s*:\\s*"[^"]*"/, \`"name": "\${PROJECT_NAME}"\`);
        fs.writeFileSync('wrangler.jsonc', content);
        console.log('Updated wrangler.jsonc with project name: ' + PROJECT_NAME);
    } catch (error) {
        console.warn('Failed to update wrangler.jsonc:', error.message);
    }
}

function runSetupCommands() {
    const commands = ${safeCommands};

    if (commands.length === 0) {
        console.log('No setup commands to run');
        return;
    }

    console.log('\\nRunning setup commands...\\n');

    for (const cmd of commands) {
        console.log(cmd);
        try {
            execSync(cmd, {
                stdio: 'inherit',
                cwd: process.cwd()
            });
        } catch (error) {
            console.warn(\`Command failed: \${cmd}\`);
            console.warn(\`Error: \${error.message}\`);
        }
    }
}
`;
}

/**
 * Update wrangler.jsonc with project name (preserves comments)
 */
function customizeWranglerJsonc(content: string, projectName: string): string {
    const edits = modify(content, ['name'], projectName, {
        formattingOptions: {
            tabSize: 2,
            insertSpaces: true,
            eol: '\n'
        }
    });
    return applyEdits(content, edits);
}

function updateGitignore(content: string): string {
    if (content.includes('.bootstrap-complete')) {
        return content;
    }
    return content + '\n# Bootstrap marker\n.bootstrap-complete\n';
}

/**
 * Generate project name from blueprint or query
 */
export function generateProjectName(
    projectName: string,
    uniqueSuffix: string,
    maxPrefixLength: number = 20
): string {
    let prefix = projectName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');

    prefix = prefix.slice(0, maxPrefixLength).replace(/^-+|-+$/g, '') || 'playable';
    const suffix = uniqueSuffix
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');

    return suffix ? `${prefix}-${suffix}` : prefix;
}
