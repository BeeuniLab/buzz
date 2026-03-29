import { modify, applyEdits } from 'jsonc-parser';

export interface TemplateCustomizationOptions {
    projectName: string;
}

export interface CustomizedTemplateFiles {
    'package.json': string;
    'wrangler.jsonc'?: string;
}

/**
 * Customize all template configuration files
 * - Updates package.json with project name
 * - Updates wrangler.jsonc with project name (if exists)
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
        .replace(/[^a-z0-9]/g, '-');

    prefix = prefix.slice(0, maxPrefixLength);
    return `${prefix}-${uniqueSuffix}`.toLowerCase();
}
