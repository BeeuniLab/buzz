import type { WranglerConfig } from '../deployer/types';
import { normalizeDeploymentId } from '../../utils/urls';

export function normalizeWorkspacePath(instanceId: string, filePath: string): string {
	const normalized = filePath.replace(/^\.?\//, '').replace(/\/+/g, '/');
	return `/workspace/${instanceId}/${normalized}`;
}

export function isJavaScriptWorkerEntry(filePath: string | undefined): boolean {
	return Boolean(filePath && /\.(mjs|js)$/i.test(filePath));
}

function normalizeCloudflareOutputName(name: string | undefined): string | undefined {
	if (!name) return undefined;
	const normalized = name
		.replace(/[^A-Za-z0-9_-]+/g, '_')
		.replace(/_+/g, '_')
		.replace(/^_+|_+$/g, '');
	return normalized || undefined;
}

function uniqueDefined(values: Array<string | undefined>): string[] {
	return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function getWorkerScriptCandidates(instanceId: string, config: WranglerConfig): string[] {
	const sourceWorkerPath = config.main ? normalizeWorkspacePath(instanceId, config.main) : undefined;
	const sourceFallback = isJavaScriptWorkerEntry(config.main) ? [sourceWorkerPath] : [];
	const outputNames = uniqueDefined([
		config.name,
		normalizeCloudflareOutputName(config.name),
		normalizeDeploymentId(config.name),
	]);

	return uniqueDefined([
		...outputNames.map((name) => normalizeWorkspacePath(instanceId, `dist/${name}/index.js`)),
		normalizeWorkspacePath(instanceId, 'dist/index.js'),
		normalizeWorkspacePath(instanceId, 'dist/_worker.js/index.js'),
		...sourceFallback,
	]);
}

export function getWorkerModuleAssetsPath(instanceId: string, workerScriptPath: string): string | undefined {
	const workspacePrefix = `/workspace/${instanceId}/`;
	if (!workerScriptPath.startsWith(workspacePrefix)) return undefined;

	const relativeWorkerPath = workerScriptPath.slice(workspacePrefix.length);
	if (!relativeWorkerPath.startsWith('dist/') || !relativeWorkerPath.endsWith('/index.js')) {
		return undefined;
	}

	const workerOutputDir = relativeWorkerPath.slice(0, -'/index.js'.length);
	return `${instanceId}/${workerOutputDir}/assets`;
}

export function getWorkerModuleRelativePath(workerAssetsPath: string, fullPath: string): string {
	const workerOutputDir = workerAssetsPath.replace(/\/assets\/?$/, '');
	const prefix = `${workerOutputDir}/`;
	return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath;
}
