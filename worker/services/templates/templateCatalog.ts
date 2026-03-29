import { unzipSync } from 'fflate';
import type {
	FileTreeNode,
	TemplateDetails,
	TemplateDetailsResponse,
	TemplateInfo,
	TemplateListResponse,
} from '../../types/project-types';

/**
 * Fetches the template catalog (template_catalog.json) from R2.
 */
export async function listTemplates(bucket: R2Bucket): Promise<TemplateListResponse> {
	try {
		const obj = await bucket.get('template_catalog.json');
		if (!obj) {
			return { success: false, templates: [], count: 0, error: 'template_catalog.json not found in R2' };
		}
		const text = await obj.text();
		const catalog = JSON.parse(text) as TemplateInfo[];
		return { success: true, templates: catalog, count: catalog.length };
	} catch (e) {
		return { success: false, templates: [], count: 0, error: `Failed to fetch template catalog: ${(e as Error).message}` };
	}
}

/**
 * Fetches a template zip from R2, extracts files, and returns full TemplateDetails.
 */
export async function getTemplateDetails(bucket: R2Bucket, templateName: string): Promise<TemplateDetailsResponse> {
	try {
		const catalogResponse = await listTemplates(bucket);
		if (!catalogResponse.success) {
			return { success: false, error: catalogResponse.error };
		}

		const templateInfo = catalogResponse.templates.find(t => t.name === templateName);
		if (!templateInfo) {
			return { success: false, error: `Template "${templateName}" not found in catalog` };
		}

		const zipKey = `${templateName}.zip`;
		const obj = await bucket.get(zipKey);
		if (!obj) {
			return { success: false, error: `Template zip "${zipKey}" not found in R2` };
		}

		const zipBuffer = await obj.arrayBuffer();
		const files = unzipSync(new Uint8Array(zipBuffer));

		const allFiles: Record<string, string> = {};
		const decoder = new TextDecoder('utf-8');

		for (const [path, content] of Object.entries(files)) {
			if (path.endsWith('/')) continue;
			try {
				allFiles[path] = decoder.decode(content);
			} catch {
				// Skip binary files
			}
		}

		const fileTree = buildFileTree(Object.keys(allFiles));

		const importantFiles = parseJsonFileList(allFiles, '.important_files.json');
		const dontTouchFiles = parseJsonFileList(allFiles, '.donttouch_files.json');
		const redactedFiles = parseJsonFileList(allFiles, '.redacted_files.json');

		const deps = extractDeps(allFiles['package.json']);

		const templateDetails: TemplateDetails = {
			...templateInfo,
			fileTree,
			allFiles,
			deps,
			importantFiles,
			dontTouchFiles,
			redactedFiles,
		};

		return { success: true, templateDetails };
	} catch (e) {
		return { success: false, error: `Failed to load template "${templateName}": ${(e as Error).message}` };
	}
}

function parseJsonFileList(allFiles: Record<string, string>, filename: string): string[] {
	const content = allFiles[filename];
	if (!content) return [];
	try {
		const parsed = JSON.parse(content);
		if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === 'string');
		return [];
	} catch {
		return [];
	}
}

function extractDeps(packageJsonContent: string | undefined): Record<string, string> {
	if (!packageJsonContent) return {};
	try {
		const pkg = JSON.parse(packageJsonContent) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
		return { ...pkg.dependencies, ...pkg.devDependencies };
	} catch {
		return {};
	}
}

function buildFileTree(paths: string[]): FileTreeNode {
	const root: FileTreeNode = { path: '', type: 'directory', children: [] };

	for (const filePath of paths) {
		const parts = filePath.split('/').filter(Boolean);
		let current = root;

		for (let i = 0; i < parts.length; i++) {
			const isLast = i === parts.length - 1;
			const partPath = parts.slice(0, i + 1).join('/');

			if (!current.children) current.children = [];

			let existing = current.children.find(c => c.path === partPath);
			if (!existing) {
				existing = {
					path: partPath,
					type: isLast ? 'file' : 'directory',
					...(isLast ? {} : { children: [] }),
				};
				current.children.push(existing);
			}
			if (!isLast) {
				current = existing;
			}
		}
	}

	return root;
}
