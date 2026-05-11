import { FileOutputType } from '../../schemas';
import { type ActiveWorkflowTask, BaseProjectState } from '../../core/state';
import { BaseSandboxService } from '../../../services/sandbox/BaseSandboxService';
import type { WriteFilesResponse } from '../../../services/sandbox/sandboxTypes';
import { DeploymentManager } from './DeploymentManager';
import { BaseAgentService } from './BaseAgentService';
import { ServiceOptions } from '../interfaces/IServiceOptions';
import type { PreviewType } from '../../../types/project-types';
import type { ProcessedImageAttachment } from '../../../types/image-attachment';
import { formatUploadedAssetContext } from '../../utils/assetContext';

const DEFAULT_CODEX_TIMEOUT_MS = 25 * 60 * 1000;
const DEFAULT_CODEX_MODEL_PROVIDER = 'crs';
const DEFAULT_PROXY_ATTEMPTS = 3;
const DEFAULT_CODEX_RECOVERY_PREFIX = 'codex-recovery';
const CODEX_RECOVERY_SNAPSHOT_VERSION = 1;
const CODEX_WORK_DIR = '.buzz/codex';
const CODEX_HOME_PATH = '.buzz/codex-home';
const CODEX_CONFIG_PATH = `${CODEX_HOME_PATH}/config.toml`;
const CODEX_AUTH_PATH = `${CODEX_HOME_PATH}/auth.json`;
const BASELINE_REF_PATH = `${CODEX_WORK_DIR}/baseline-ref.txt`;
const CHANGED_FILES_PATH = `${CODEX_WORK_DIR}/changed-files.txt`;
const DELETED_FILES_PATH = `${CODEX_WORK_DIR}/deleted-files.txt`;
const PROMPT_PATH = `${CODEX_WORK_DIR}/prompt.md`;
const OUTPUT_PATH = `${CODEX_WORK_DIR}/output.jsonl`;
const CODEX_EXTERNAL_SANDBOX_FLAG = '--dangerously-bypass-approvals-and-sandbox';

type CodexEnv = {
	OPENAI_API_KEY: string;
	OPENAI_BASE_URL?: string;
	CODEX_HOME: string;
};

type CodexRuntime = {
	envVars: CodexEnv;
	codexHome: string;
	model?: string;
	modelProvider: string;
	baseUrl?: string;
	reasoningEffort?: string;
	source: 'primary' | 'fallback';
};

type CodexProvider = {
	apiKey: string;
	baseUrl?: string;
	source: CodexRuntime['source'];
};

type CodexRuntimePlan = {
	primary: CodexRuntime;
	fallback?: CodexRuntime;
};

type CodexSessionPersistence = {
	bucketName: string;
	mountPath: string;
	sessionsPath: string;
	endpoint: string;
	credentials: {
		accessKeyId: string;
		secretAccessKey: string;
	};
};

export interface CodexGenerationRequest {
	kind: ActiveWorkflowTask['kind'];
	query: string;
	workflowId: string;
	recoveryWorkflowId?: string;
	uploadedAssets?: ProcessedImageAttachment[];
	model?: string;
	timeoutMs?: number;
	onExecutionStarted?: () => void | Promise<void>;
}

export interface CodexGenerationResult {
	changedFiles: FileOutputType[];
	deletedFiles: string[];
	playableChangedFiles: string[];
	preview: PreviewType | null;
	madeChanges: boolean;
	madePlayableChanges: boolean;
	noChangeReason?: string;
}

type CodexRecoverySnapshot = {
	version: typeof CODEX_RECOVERY_SNAPSHOT_VERSION;
	agentId: string;
	workflowId: string;
	kind: ActiveWorkflowTask['kind'];
	createdAt: number;
	templateName?: string;
	projectType?: string;
	changedFiles: FileOutputType[];
	deletedFiles: string[];
	madeChanges: boolean;
};

const PLAYABLE_CONFIG_PATHS = new Set([
	'index.html',
	'package.json',
	'vite.config.js',
	'vite.config.ts',
	'wrangler.jsonc',
	'wrangler.toml',
	'tsconfig.json',
	'tsconfig.node.json',
]);
const PLAYABLE_SOURCE_PREFIXES = ['src/', 'worker/', 'public/'];
const PLAYABLE_FILE_EXTENSIONS = new Set([
	'.ts',
	'.tsx',
	'.js',
	'.jsx',
	'.mjs',
	'.cjs',
	'.css',
	'.scss',
	'.sass',
	'.less',
	'.html',
	'.json',
	'.jsonc',
	'.toml',
	'.yaml',
	'.yml',
]);
const NON_PLAYABLE_PROJECT_PATHS = new Set([
	'.bootstrap.js',
	'.bootstrap-complete',
	'.reload-trigger',
	'src/asset_map',
]);

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function envString(env: Env, key: string): string | undefined {
	const value = (env as unknown as Record<string, unknown>)[key];
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function trimSlashes(value: string): string {
	return value.replace(/^\/+|\/+$/g, '');
}

function safePathSegment(value: string): string {
	return value.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80) || 'unknown';
}

function tomlString(value: string): string {
	return JSON.stringify(value);
}

function workspacePath(instanceId: string, relativePath: string): string {
	return `/workspace/${instanceId}/${relativePath}`;
}

function normalizeProjectPath(path: string): string {
	return path.trim().replace(/^\.\/+/, '');
}

function fileExtension(path: string): string {
	const filename = path.split('/').pop() || path;
	const dotIndex = filename.lastIndexOf('.');
	return dotIndex > 0 ? filename.slice(dotIndex).toLowerCase() : '';
}

function isCollectableProjectPath(path: string): boolean {
	const normalized = normalizeProjectPath(path);
	return Boolean(normalized)
		&& !normalized.startsWith('.buzz/')
		&& !normalized.startsWith('.codex/')
		&& !normalized.startsWith('.data/')
		&& !normalized.startsWith('.git/')
		&& !normalized.startsWith('.wrangler/')
		&& !normalized.startsWith('node_modules/')
		&& !normalized.startsWith('dist/')
		&& !normalized.startsWith('build/')
		&& normalized !== '.reload-trigger';
}

function isPlayableProjectPath(path: string): boolean {
	const normalized = normalizeProjectPath(path);
	if (!isCollectableProjectPath(normalized) || NON_PLAYABLE_PROJECT_PATHS.has(normalized)) {
		return false;
	}
	if (PLAYABLE_CONFIG_PATHS.has(normalized)) {
		return true;
	}
	if (!PLAYABLE_SOURCE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
		return false;
	}
	return PLAYABLE_FILE_EXTENSIONS.has(fileExtension(normalized));
}

function uniquePlayableChangedPaths(changedFiles: FileOutputType[], deletedPaths: string[]): string[] {
	return [...new Set([
		...changedFiles.map((file) => normalizeProjectPath(file.filePath)),
		...deletedPaths.map(normalizeProjectPath),
	].filter(isPlayableProjectPath))];
}

function buildCodexRuntime(env: Env, instanceId: string, requestedModel: string | undefined, provider: CodexProvider): CodexRuntime {
	const codexHome = workspacePath(instanceId, CODEX_HOME_PATH);
	const reasoningEffort = envString(env, 'CODEX_MODEL_REASONING_EFFORT');
	return {
		envVars: {
			OPENAI_API_KEY: provider.apiKey,
			CODEX_HOME: codexHome,
			...(provider.baseUrl ? { OPENAI_BASE_URL: provider.baseUrl } : {}),
		},
		codexHome,
		model: requestedModel || envString(env, 'CODEX_MODEL'),
		modelProvider: safePathSegment(envString(env, 'CODEX_MODEL_PROVIDER') || DEFAULT_CODEX_MODEL_PROVIDER),
		...(provider.baseUrl ? { baseUrl: provider.baseUrl } : {}),
		...(reasoningEffort ? { reasoningEffort } : {}),
		source: provider.source,
	};
}

function sameCodexProvider(a: CodexProvider | undefined, b: CodexProvider | undefined): boolean {
	return Boolean(a && b && a.apiKey === b.apiKey && a.baseUrl === b.baseUrl);
}

function resolveCodexRuntimePlan(env: Env, instanceId: string, requestedModel?: string): CodexRuntimePlan {
	const explicitKey = envString(env, 'CODEX_OPENAI_API_KEY');
	const openAiKey = envString(env, 'OPENAI_API_KEY');
	const proxyKey = envString(env, 'LLM_PROXY_API_KEY');
	const fallbackProxyKey = envString(env, 'LLM_PROXY_FALLBACK_API_KEY');
	const explicitBaseUrl = envString(env, 'CODEX_OPENAI_BASE_URL');
	const proxyUrl = envString(env, 'LLM_PROXY_URL');
	const fallbackProxyUrl = envString(env, 'LLM_PROXY_FALLBACK_URL');
	let primaryProvider: CodexProvider | undefined;
	let fallbackProvider: CodexProvider | undefined;

	if (explicitKey) {
		primaryProvider = { apiKey: explicitKey, ...(explicitBaseUrl ? { baseUrl: explicitBaseUrl } : {}), source: 'primary' };
	} else if (openAiKey) {
		primaryProvider = { apiKey: openAiKey, ...(explicitBaseUrl ? { baseUrl: explicitBaseUrl } : {}), source: 'primary' };
	} else if (proxyKey) {
		primaryProvider = { apiKey: proxyKey, ...(proxyUrl ? { baseUrl: proxyUrl } : {}), source: 'primary' };
		if (fallbackProxyKey && fallbackProxyUrl) {
			fallbackProvider = { apiKey: fallbackProxyKey, baseUrl: fallbackProxyUrl, source: 'fallback' };
		}
	} else if (fallbackProxyKey) {
		primaryProvider = {
			apiKey: fallbackProxyKey,
			...(fallbackProxyUrl || proxyUrl ? { baseUrl: fallbackProxyUrl || proxyUrl } : {}),
			source: 'primary',
		};
	}

	if (!primaryProvider) {
		throw new Error('Background generator requires an LLM API key');
	}

	const primary = buildCodexRuntime(env, instanceId, requestedModel, primaryProvider);
	const fallback = sameCodexProvider(primaryProvider, fallbackProvider)
		? undefined
		: fallbackProvider
		? buildCodexRuntime(env, instanceId, requestedModel, fallbackProvider)
		: undefined;

	return {
		primary,
		...(fallback ? { fallback } : {}),
	};
}

function resolveCodexSessionPersistence(env: Env, agentId: string): CodexSessionPersistence | null {
	const bucketName = envString(env, 'CODEX_STATE_R2_BUCKET_NAME');
	const accessKeyId = envString(env, 'CODEX_STATE_R2_ACCESS_KEY_ID') || envString(env, 'R2_ACCESS_KEY_ID') || envString(env, 'AWS_ACCESS_KEY_ID');
	const secretAccessKey = envString(env, 'CODEX_STATE_R2_SECRET_ACCESS_KEY') || envString(env, 'R2_SECRET_ACCESS_KEY') || envString(env, 'AWS_SECRET_ACCESS_KEY');
	const explicitEndpoint = envString(env, 'CODEX_STATE_R2_ENDPOINT') || envString(env, 'R2_ENDPOINT');
	const accountId = envString(env, 'CLOUDFLARE_ACCOUNT_ID');
	const hasAnyConfig = Boolean(
		bucketName
		|| envString(env, 'CODEX_STATE_R2_ACCESS_KEY_ID')
		|| envString(env, 'CODEX_STATE_R2_SECRET_ACCESS_KEY')
		|| envString(env, 'CODEX_STATE_R2_ENDPOINT')
		|| envString(env, 'CODEX_STATE_R2_PREFIX')
	);

	if (!hasAnyConfig) {
		return null;
	}
	if (!bucketName || !accessKeyId || !secretAccessKey) {
		throw new Error('Background session persistence is missing the R2 bucket or credentials');
	}

	const endpoint = explicitEndpoint || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
	if (!endpoint) {
		throw new Error('Background session persistence is missing the R2 endpoint or Cloudflare account id');
	}

	const safeAgentId = safePathSegment(agentId);
	const prefix = trimSlashes(envString(env, 'CODEX_STATE_R2_PREFIX') || 'codex-state');
	const mountPath = `/mnt/buzz-codex-state-${safeAgentId}`;
	return {
		bucketName,
		mountPath,
		sessionsPath: `${mountPath}/${prefix}/${safeAgentId}/sessions`,
		endpoint,
		credentials: { accessKeyId, secretAccessKey },
	};
}

function parsePathList(content: string): string[] {
	return content
		.split('\n')
		.map(normalizeProjectPath)
		.filter(isCollectableProjectPath);
}

function readReturnedFile(files: Array<{ filePath: string; fileContents: string }>, path: string): string {
	return files.find((file) => file.filePath === path)?.fileContents ?? '';
}

function isFileOutput(value: unknown): value is FileOutputType {
	if (!value || typeof value !== 'object') return false;
	const record = value as Record<string, unknown>;
	return typeof record.filePath === 'string'
		&& typeof record.fileContents === 'string'
		&& typeof record.filePurpose === 'string';
}

function assertWriteSucceeded(result: WriteFilesResponse, filePath: string, label: string): void {
	const fileResult = result.results.find((entry) => entry.file === filePath || entry.file.endsWith(`/${filePath}`));
	if (!result.success || fileResult?.success === false) {
		throw new Error(`Failed to write ${label}: ${fileResult?.error || result.error || 'unknown error'}`);
	}
}

function parseCodexJsonlOutput(output: string): Array<Record<string, unknown>> {
	const events: Array<Record<string, unknown>> = [];
	let start = -1;
	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let index = 0; index < output.length; index += 1) {
		const char = output[index];
		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === '"') {
				inString = false;
			}
			continue;
		}

		if (char === '"') {
			inString = true;
			continue;
		}
		if (char === '{') {
			if (depth === 0) start = index;
			depth += 1;
			continue;
		}
		if (char === '}' && depth > 0) {
			depth -= 1;
			if (depth === 0 && start >= 0) {
				const chunk = output.slice(start, index + 1);
				start = -1;
				try {
					const parsed = JSON.parse(chunk);
					if (parsed && typeof parsed === 'object') {
						events.push(parsed as Record<string, unknown>);
					}
				} catch {
					// Ignore non-Codex JSON fragments in command output.
				}
			}
		}
	}

	if (events.length > 0) {
		return events;
	}

	return output
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			try {
				const parsed = JSON.parse(line);
				return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
			} catch {
				return null;
			}
		})
		.filter((event): event is Record<string, unknown> => event !== null);
}

function getCodexEventErrorMessage(event: Record<string, unknown>): string | null {
	if (event.type === 'turn.failed') {
		const error = event.error;
		if (error && typeof error === 'object' && 'message' in error) {
			const message = (error as { message?: unknown }).message;
			return typeof message === 'string' && message.trim() ? message.trim() : null;
		}
	}

	const message = event.message;
	return typeof message === 'string' && message.trim() ? message.trim() : null;
}

function summarizeCodexFailure(output: string, fallback: string): string {
	const events = parseCodexJsonlOutput(output);
	const messages = events
		.map(getCodexEventErrorMessage)
		.filter((message): message is string => Boolean(message));
	const lastMessage = messages[messages.length - 1] || fallback || 'unknown error';
	const concise = lastMessage.replace(/\s+/g, ' ').trim();
	return concise.length > 1000 ? `${concise.slice(0, 1000)}...` : concise;
}

function summarizeCodexNoChangeReason(output: string): string | undefined {
	const normalized = output.toLowerCase();
	if (
		normalized.includes('bwrap:')
		|| normalized.includes('no permissions to create a new namespace')
		|| normalized.includes('fs sandbox helper failed')
	) {
		return 'Its internal command sandbox could not start inside the app container, so it could not inspect or edit project files.';
	}

	return undefined;
}

const RETRYABLE_HTTP_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const NON_RETRYABLE_HTTP_STATUS_CODES = new Set([400, 401, 403, 404, 422]);

const RETRYABLE_ERROR_PATTERNS = [
	'rate limit',
	'too many requests',
	'timed out',
	'timeout',
	'temporarily unavailable',
	'service unavailable',
	'bad gateway',
	'gateway timeout',
	'internal server error',
	'overloaded',
	'connection reset',
	'connection refused',
	'network error',
	'socket hang up',
	'econnreset',
	'etimedout',
	'ehostunreach',
	'enetunreach',
];

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function extractHttpStatusCode(message: string): number | null {
	const match = message.match(
		/(?:status(?:[_ ]?code)?|http(?: response)?)["'\s:=]+(\d{3})\b/i,
	);
	return match ? Number(match[1]) : null;
}

function includesAny(message: string, patterns: string[]): boolean {
	return patterns.some((pattern) => message.includes(pattern));
}

function isRetryableCodexFailure(error: unknown): boolean {
	const message = getErrorMessage(error);
	const normalized = message.toLowerCase();
	const statusCode = extractHttpStatusCode(message);

	if (statusCode !== null) {
		if (RETRYABLE_HTTP_STATUS_CODES.has(statusCode)) return true;
		if (NON_RETRYABLE_HTTP_STATUS_CODES.has(statusCode)) return false;
	}

	return includesAny(normalized, RETRYABLE_ERROR_PATTERNS);
}

function genericAgentFailureMessage(): string {
	return 'Background agent encountered an issue before finishing.';
}

export class CodexGenerationManager<TState extends BaseProjectState = BaseProjectState> extends BaseAgentService<TState> {
	constructor(
		options: ServiceOptions<TState>,
		private readonly deploymentManager: DeploymentManager,
	) {
		super(options);
	}

	async run(request: CodexGenerationRequest): Promise<CodexGenerationResult> {
		const logger = this.getLog();
		const state = this.getState();
		logger.info('Preparing sandbox for Codex background generation', {
			workflowId: request.workflowId,
			templateName: state.templateName,
			projectType: state.projectType,
		});

		let deployedPreview = await this.deploymentManager.deployToSandbox(
			[],
			false,
			'chore: prepare workspace for background generator',
			false,
		);
		const instanceId = this.getState().sandboxInstanceId || deployedPreview?.runId;
		if (!instanceId) {
			throw new Error('Background generator could not prepare a sandbox instance');
		}

		const client = this.deploymentManager.getClient();
		const recoveredSnapshot = await this.loadRecoverySnapshot(request);
		if (recoveredSnapshot) {
			logger.info('Applying recovered background generator snapshot', {
				workflowId: request.workflowId,
				recoveryWorkflowId: request.recoveryWorkflowId,
				snapshotWorkflowId: recoveredSnapshot.workflowId,
				changedCount: recoveredSnapshot.changedFiles.length,
				deletedCount: recoveredSnapshot.deletedFiles.length,
			});
			return this.applyGeneratedChanges(
				recoveredSnapshot.changedFiles,
				recoveredSnapshot.deletedFiles,
				deployedPreview,
			);
		}

		const runtimePlan = resolveCodexRuntimePlan(this.env, instanceId, request.model);
		await this.createGitBaseline(client, instanceId);
		await this.prepareCodexHome(client, instanceId, runtimePlan.primary);
		await this.writePrompt(client, instanceId, this.buildPrompt(request));

		await request.onExecutionStarted?.();
		await this.runCodexExecWithFailover(client, instanceId, request, runtimePlan);
		const changedPaths = await this.collectChangedPaths(client, instanceId);
		const deletedPaths = await this.collectDeletedPaths(client, instanceId);
		const madeChanges = changedPaths.length > 0 || deletedPaths.length > 0;

		logger.info('Codex changed files collected', {
			workflowId: request.workflowId,
			changedCount: changedPaths.length,
			deletedCount: deletedPaths.length,
			changedPaths,
			deletedPaths,
		});
		if (!madeChanges) {
			logger.info('Background project agent completed without project file changes', {
				workflowId: request.workflowId,
				kind: request.kind,
			});
		}

		const changedFiles = await this.readChangedFiles(client, instanceId, changedPaths);
		const noChangeReason = madeChanges
			? undefined
			: summarizeCodexNoChangeReason(await this.readOptionalFile(client, instanceId, OUTPUT_PATH));
		if (madeChanges) {
			await this.persistRecoverySnapshot(request, changedFiles, deletedPaths);
		}
		return this.applyGeneratedChanges(changedFiles, deletedPaths, deployedPreview, noChangeReason);
	}

	private async applyGeneratedChanges(
		changedFiles: FileOutputType[],
		deletedPaths: string[],
		deployedPreview: PreviewType | null,
		noChangeReason?: string,
	): Promise<CodexGenerationResult> {
		const playableChangedFiles = uniquePlayableChangedPaths(changedFiles, deletedPaths);
		if (changedFiles.length > 0) {
			await this.fileManager.saveGeneratedFiles(
				changedFiles,
				'feat: apply Codex generated changes',
			);
			const nextPreview = await this.deploymentManager.deployToSandbox(
				changedFiles,
				false,
				'feat: apply Codex generated changes',
				false,
			);
			if (!nextPreview) {
				throw new Error('The project agent updated the project but could not deploy the playable version this time.');
			}
			deployedPreview = nextPreview;
		}

		if (deletedPaths.length > 0) {
			this.fileManager.deleteFiles(deletedPaths);
		}

		return {
			changedFiles,
			deletedFiles: deletedPaths,
			playableChangedFiles,
			preview: deployedPreview,
			madeChanges: changedFiles.length > 0 || deletedPaths.length > 0,
			madePlayableChanges: playableChangedFiles.length > 0,
			...(noChangeReason ? { noChangeReason } : {}),
		};
	}

	private getRecoveryBucket(): R2Bucket | null {
		return (this.env as unknown as { TEMPLATES_BUCKET?: R2Bucket }).TEMPLATES_BUCKET ?? null;
	}

	private getRecoveryPrefix(): string {
		return trimSlashes(envString(this.env, 'CODEX_RECOVERY_R2_PREFIX') || DEFAULT_CODEX_RECOVERY_PREFIX);
	}

	private getRecoverySnapshotKey(workflowId: string): string {
		return `${this.getRecoveryPrefix()}/${safePathSegment(this.getAgentId())}/${safePathSegment(workflowId)}.json`;
	}

	private getRecoveryWorkflowIds(request: CodexGenerationRequest): string[] {
		return [...new Set([request.recoveryWorkflowId, request.workflowId].filter((id): id is string => Boolean(id)))];
	}

	private isValidRecoverySnapshot(
		value: unknown,
		request: CodexGenerationRequest,
		allowedWorkflowIds: Set<string>,
	): value is CodexRecoverySnapshot {
		if (!value || typeof value !== 'object') return false;
		const snapshot = value as Record<string, unknown>;
		if (snapshot.version !== CODEX_RECOVERY_SNAPSHOT_VERSION) return false;
		if (snapshot.agentId !== this.getAgentId()) return false;
		if (snapshot.kind !== request.kind) return false;
		if (typeof snapshot.workflowId !== 'string' || !allowedWorkflowIds.has(snapshot.workflowId)) return false;
		if (!Array.isArray(snapshot.changedFiles) || !snapshot.changedFiles.every(isFileOutput)) return false;
		if (!Array.isArray(snapshot.deletedFiles) || !snapshot.deletedFiles.every((path) => typeof path === 'string')) return false;
		return typeof snapshot.madeChanges === 'boolean';
	}

	private async loadRecoverySnapshot(request: CodexGenerationRequest): Promise<CodexRecoverySnapshot | null> {
		const bucket = this.getRecoveryBucket();
		if (!bucket) return null;

		const workflowIds = this.getRecoveryWorkflowIds(request);
		if (workflowIds.length === 0) return null;

		const allowedWorkflowIds = new Set(workflowIds);
		for (const workflowId of workflowIds) {
			const key = this.getRecoverySnapshotKey(workflowId);
			try {
				const object = await bucket.get(key);
				if (!object) continue;
				const parsed = JSON.parse(await object.text()) as unknown;
				if (!this.isValidRecoverySnapshot(parsed, request, allowedWorkflowIds)) {
					this.getLog().warn('Ignoring invalid background generator recovery snapshot', {
						workflowId: request.workflowId,
						recoveryWorkflowId: request.recoveryWorkflowId,
						key,
					});
					continue;
				}
				if (!parsed.madeChanges) {
					this.getLog().info('Ignoring empty background generator recovery snapshot', {
						workflowId: request.workflowId,
						recoveryWorkflowId: request.recoveryWorkflowId,
						snapshotWorkflowId: parsed.workflowId,
						key,
					});
					continue;
				}
				this.getLog().info('Loaded background generator recovery snapshot', {
					workflowId: request.workflowId,
					recoveryWorkflowId: request.recoveryWorkflowId,
					snapshotWorkflowId: parsed.workflowId,
					key,
				});
				return parsed;
			} catch (error) {
				this.getLog().warn('Failed to load background generator recovery snapshot', {
					workflowId: request.workflowId,
					recoveryWorkflowId: request.recoveryWorkflowId,
					key,
					error: getErrorMessage(error),
				});
			}
		}

		return null;
	}

	private async persistRecoverySnapshot(
		request: CodexGenerationRequest,
		changedFiles: FileOutputType[],
		deletedFiles: string[],
	): Promise<void> {
		const bucket = this.getRecoveryBucket();
		if (!bucket) return;

		const state = this.getState();
		const snapshot: CodexRecoverySnapshot = {
			version: CODEX_RECOVERY_SNAPSHOT_VERSION,
			agentId: this.getAgentId(),
			workflowId: request.workflowId,
			kind: request.kind,
			createdAt: Date.now(),
			templateName: state.templateName,
			projectType: state.projectType,
			changedFiles,
			deletedFiles,
			madeChanges: changedFiles.length > 0 || deletedFiles.length > 0,
		};
		const key = this.getRecoverySnapshotKey(request.workflowId);

		try {
			await bucket.put(key, JSON.stringify(snapshot), {
				httpMetadata: { contentType: 'application/json' },
				customMetadata: {
					agentId: this.getAgentId(),
					workflowId: request.workflowId,
					kind: request.kind,
				},
			});
			this.getLog().info('Persisted background generator recovery snapshot', {
				workflowId: request.workflowId,
				key,
				changedCount: changedFiles.length,
				deletedCount: deletedFiles.length,
			});
		} catch (error) {
			this.getLog().warn('Failed to persist background generator recovery snapshot', {
				workflowId: request.workflowId,
				key,
				error: getErrorMessage(error),
			});
		}
	}

	private async prepareCodexHome(client: BaseSandboxService, instanceId: string, runtime: CodexRuntime): Promise<void> {
		const persistence = resolveCodexSessionPersistence(this.env, this.getAgentId());
		const localSessionsPath = `${runtime.codexHome}/sessions`;
		let command: string;

		if (persistence) {
			const mount = await client.mountBucket(instanceId, {
				bucketName: persistence.bucketName,
				mountPath: persistence.mountPath,
				endpoint: persistence.endpoint,
				provider: 'r2',
				credentials: persistence.credentials,
			});
			if (!mount.success) {
				throw new Error(mount.error || 'Failed to mount background session bucket');
			}

			command = [
				`mkdir -p ${shellQuote(runtime.codexHome)} ${shellQuote(persistence.sessionsPath)}`,
				`if [ -e ${shellQuote(localSessionsPath)} ] && [ ! -L ${shellQuote(localSessionsPath)} ]; then mv ${shellQuote(localSessionsPath)} ${shellQuote(`${runtime.codexHome}/sessions.local`)}.$(date +%s); fi`,
				`ln -sfn ${shellQuote(persistence.sessionsPath)} ${shellQuote(localSessionsPath)}`,
			].join(' && ');
		} else {
			command = `mkdir -p ${shellQuote(localSessionsPath)}`;
		}

		const result = await client.executeCommands(instanceId, [command], 60_000);
		const setup = result.results[0];
		if (!result.success || !setup?.success) {
			throw new Error(`Failed to prepare background generator state: ${setup?.error || result.error || 'unknown error'}`);
		}
	}

	private async prepareCodexEnvironment(client: BaseSandboxService, instanceId: string, runtime: CodexRuntime): Promise<void> {
		const result = await client.setInstanceEnvVars(instanceId, runtime.envVars);
		if (!result.success) {
			throw new Error(result.error || 'Sandbox service does not support background generator environment injection');
		}
	}

	private async writeCodexConfig(client: BaseSandboxService, instanceId: string, runtime: CodexRuntime): Promise<void> {
		const result = await client.writeFiles(instanceId, [
			{
				filePath: CODEX_CONFIG_PATH,
				fileContents: this.buildCodexConfig(runtime),
			},
		]);
		assertWriteSucceeded(result, CODEX_CONFIG_PATH, 'background generator config');
	}

	private async writeCodexAuth(client: BaseSandboxService, instanceId: string, runtime: CodexRuntime): Promise<void> {
		const result = await client.writeFiles(instanceId, [
			{
				filePath: CODEX_AUTH_PATH,
				fileContents: `${JSON.stringify({
					auth_mode: 'apikey',
					OPENAI_API_KEY: runtime.envVars.OPENAI_API_KEY,
				}, null, 2)}\n`,
			},
		]);
		assertWriteSucceeded(result, CODEX_AUTH_PATH, 'background generator auth');

		const chmod = await client.executeCommands(
			instanceId,
			[`chmod 700 ${shellQuote(CODEX_HOME_PATH)} && chmod 600 ${shellQuote(CODEX_AUTH_PATH)}`],
			60_000,
		);
		const chmodRun = chmod.results[0];
		if (!chmod.success || !chmodRun?.success) {
			throw new Error(`Failed to secure background generator auth: ${chmodRun?.error || chmod.error || 'unknown error'}`);
		}
	}

	private async createGitBaseline(client: BaseSandboxService, instanceId: string): Promise<void> {
		const command = [
			`mkdir -p ${shellQuote(CODEX_WORK_DIR)}`,
			'git init',
			'git config user.email "buzzplay-codex@buzzplay.app"',
			'git config user.name "Buzzplay Codex"',
			'mkdir -p .git/info',
			`printf '\\n.buzz/\\n.codex/\\n.data/\\n.wrangler/\\nnode_modules/\\ndist/\\nbuild/\\n' >> .git/info/exclude`,
			'git add -A',
			'(git diff --cached --quiet || git commit -m "chore: baseline before codex")',
			`git rev-parse HEAD > ${shellQuote(BASELINE_REF_PATH)}`,
		].join(' && ');
		const result = await client.executeCommands(instanceId, [command], 60_000);
		const baseline = result.results[0];
		if (!result.success || !baseline?.success) {
			throw new Error(`Failed to create background generator git baseline: ${baseline?.error || result.error || 'unknown error'}`);
		}
	}

	private async writePrompt(client: BaseSandboxService, instanceId: string, prompt: string): Promise<void> {
		const result = await client.writeFiles(instanceId, [
			{
				filePath: PROMPT_PATH,
				fileContents: prompt,
			},
		]);
		assertWriteSucceeded(result, PROMPT_PATH, 'background generator prompt');
	}

	private getProviderAttemptLimit(): number {
		const configured = Number(envString(this.env, 'CODEX_PROXY_ATTEMPTS') || DEFAULT_PROXY_ATTEMPTS);
		return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_PROXY_ATTEMPTS;
	}

	private async runCodexExecWithFailover(
		client: BaseSandboxService,
		instanceId: string,
		request: CodexGenerationRequest,
		runtimePlan: CodexRuntimePlan,
	): Promise<void> {
		const logger = this.getLog();
		const runtimes = [runtimePlan.primary, runtimePlan.fallback].filter((runtime): runtime is CodexRuntime => Boolean(runtime));
		const maxAttempts = this.getProviderAttemptLimit();
		let lastError: unknown;

		for (let providerIndex = 0; providerIndex < runtimes.length; providerIndex += 1) {
			const runtime = runtimes[providerIndex];
			const hasNextProvider = providerIndex < runtimes.length - 1;

			await this.prepareCodexEnvironment(client, instanceId, runtime);
			await this.writeCodexConfig(client, instanceId, runtime);
			await this.writeCodexAuth(client, instanceId, runtime);

			for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
				try {
					await this.runCodexExecOnce(client, instanceId, request, runtime);
					if (runtime.source === 'fallback' || attempt > 1) {
						logger.info('Background generator completed after retry path', {
							workflowId: request.workflowId,
							provider: runtime.source,
							attempt,
						});
					}
					return;
				} catch (error) {
					lastError = error;
					const retryable = isRetryableCodexFailure(error);
					const willRetryProvider = retryable && attempt < maxAttempts;
					const willSwitchProvider = retryable && !willRetryProvider && hasNextProvider;
					logger.warn('Background generator attempt failed', {
						workflowId: request.workflowId,
						provider: runtime.source,
						attempt,
						maxAttempts,
						retryable,
						willRetryProvider,
						willSwitchProvider,
						error: getErrorMessage(error),
					});

					if (willRetryProvider) {
						continue;
					}
					if (willSwitchProvider) {
						break;
					}
					if (runtime.source === 'fallback' || retryable) {
						throw new Error(genericAgentFailureMessage());
					}
					throw error instanceof Error ? error : new Error(getErrorMessage(error));
				}
			}
		}

		logger.warn('Background generator providers exhausted', {
			workflowId: request.workflowId,
			error: lastError ? getErrorMessage(lastError) : undefined,
		});
		throw new Error(genericAgentFailureMessage());
	}

	private async runCodexExecOnce(
		client: BaseSandboxService,
		instanceId: string,
		request: CodexGenerationRequest,
		runtime: CodexRuntime,
	): Promise<void> {
		const model = runtime.model;
		const modelArg = model ? ` --model ${shellQuote(model)}` : '';
		const timeoutMs = request.timeoutMs
			?? Number(envString(this.env, 'CODEX_EXEC_TIMEOUT_MS') || DEFAULT_CODEX_TIMEOUT_MS);
		const sessionsPath = `${runtime.codexHome}/sessions`;
		const codexHomePrefix = `CODEX_HOME=${shellQuote(runtime.codexHome)}`;
		const hasSessionFiles = `find ${shellQuote(sessionsPath)} -type f -name '*.jsonl' -print -quit | grep -q .`;
		const resumeCommand = `${codexHomePrefix} codex exec resume --last --all --json ${CODEX_EXTERNAL_SANDBOX_FLAG} --skip-git-repo-check${modelArg} - < ${shellQuote(PROMPT_PATH)}`;
		const newCommand = `${codexHomePrefix} codex exec --json ${CODEX_EXTERNAL_SANDBOX_FLAG} --skip-git-repo-check${modelArg} - < ${shellQuote(PROMPT_PATH)}`;
		const command = [
			`mkdir -p ${shellQuote(CODEX_WORK_DIR)}`,
			`if ${hasSessionFiles}; then ${resumeCommand}; else ${newCommand}; fi > ${shellQuote(OUTPUT_PATH)} 2>&1`,
		].join(' && ');

		const result = await client.executeCommands(instanceId, [command], timeoutMs);
		const codexRun = result.results[0];
		const output = await this.readOptionalFile(client, instanceId, OUTPUT_PATH)
			|| codexRun?.output
			|| codexRun?.error
			|| '';
		if (!result.success || !codexRun?.success) {
			const summary = summarizeCodexFailure(output, codexRun?.error || result.error || 'unknown error');
			throw new Error(`Background project update failed: ${summary}`);
		}
	}

	private async readOptionalFile(client: BaseSandboxService, instanceId: string, path: string): Promise<string> {
		const filesResult = await client.getFiles(instanceId, [path]);
		if (!filesResult.success) return '';
		return readReturnedFile(filesResult.files, path);
	}

	private async collectChangedPaths(client: BaseSandboxService, instanceId: string): Promise<string[]> {
		const command = [
			`mkdir -p ${shellQuote(CODEX_WORK_DIR)}`,
			`BASELINE="$(cat ${shellQuote(BASELINE_REF_PATH)} 2>/dev/null || git rev-parse HEAD 2>/dev/null || true)" && (({ git diff --name-only --diff-filter=ACMRTUXB "$BASELINE"..HEAD; git diff --name-only --diff-filter=ACMRTUXB "$BASELINE"; git diff --cached --name-only --diff-filter=ACMRTUXB "$BASELINE"; git ls-files --others --exclude-standard; } | grep -v '^\\.buzz/' | grep -v '^\\.codex/' | grep -v '^\\.data/' | grep -v '^\\.wrangler/' | grep -v '^node_modules/' | grep -v '^dist/' | grep -v '^build/' | sort -u > ${shellQuote(CHANGED_FILES_PATH)}) || true)`,
			`BASELINE="$(cat ${shellQuote(BASELINE_REF_PATH)} 2>/dev/null || git rev-parse HEAD 2>/dev/null || true)" && (({ git diff --name-only --diff-filter=D "$BASELINE"..HEAD; git diff --name-only --diff-filter=D "$BASELINE"; git diff --cached --name-only --diff-filter=D "$BASELINE"; } | grep -v '^\\.buzz/' | grep -v '^\\.codex/' | grep -v '^\\.data/' | grep -v '^\\.wrangler/' | grep -v '^node_modules/' | grep -v '^dist/' | grep -v '^build/' | sort -u > ${shellQuote(DELETED_FILES_PATH)}) || true)`,
		].join(' && ');
		const result = await client.executeCommands(instanceId, [command], 60_000);
		const collect = result.results[0];
		if (!result.success || !collect?.success) {
			throw new Error(`Failed to collect background file changes: ${collect?.error || result.error || 'unknown error'}`);
		}

		const filesResult = await client.getFiles(instanceId, [CHANGED_FILES_PATH]);
		if (!filesResult.success) {
			throw new Error(`Failed to read background changed file list: ${filesResult.error || 'unknown error'}`);
		}

		return parsePathList(readReturnedFile(filesResult.files, CHANGED_FILES_PATH));
	}

	private async collectDeletedPaths(client: BaseSandboxService, instanceId: string): Promise<string[]> {
		const filesResult = await client.getFiles(instanceId, [DELETED_FILES_PATH]);
		if (!filesResult.success) {
			return [];
		}
		return parsePathList(readReturnedFile(filesResult.files, DELETED_FILES_PATH));
	}

	private async readChangedFiles(
		client: BaseSandboxService,
		instanceId: string,
		changedPaths: string[],
	): Promise<FileOutputType[]> {
		if (changedPaths.length === 0) return [];

		const filesResult = await client.getFiles(instanceId, changedPaths);
		if (!filesResult.success) {
			throw new Error(`Failed to read background changed files: ${filesResult.error || 'unknown error'}`);
		}

		return filesResult.files.map((file) => ({
			filePath: file.filePath,
			fileContents: file.fileContents,
			filePurpose: 'Generated or modified by background generation',
		}));
	}

	private buildPrompt(request: CodexGenerationRequest): string {
		const state = this.getState();
		const originalRequest = state.query || request.query;
		const modeInstruction = request.kind === 'create_project'
			? 'Create the first working version of this project from the template.'
			: 'Modify and continue the existing project in place based on the latest request.';
		const latestUploadedAssetContext = formatUploadedAssetContext(request.uploadedAssets, {
			title: 'LATEST_UPLOADED_MEDIA',
			includeRules: false,
		});
		const postValidationContext = state.lastPostValidationFailure
			? [
				'Recent post validation failure:',
				'The previous Post attempt was blocked by these detected issues. Prioritize fixing them before adding new scope. Treat line numbers as hints and verify against current code.',
				state.lastPostValidationFailure,
				'',
			].join('\n')
			: '';
		return [
			'You are running inside a Buzzplay project workspace.',
			'Implement the requested project by editing files directly in this repository.',
			'Follow the project AGENTS.md instructions for BuzzPlay content direction, Phaser usage, assets, touch controls, and preview constraints.',
			'Do not commit changes. Leave the final filesystem state ready for Buzzplay to collect with git diff.',
			'Respect the existing template, framework, and file structure. Do not edit files under .buzz, .codex, .git, .wrangler, node_modules, dist, or build.',
			'Do not modify files listed in .donttouch_files.json if that file exists.',
			'Uploaded user media, if any, is listed in src/asset_map. Use those asset entries directly; inspect image URLs when needed, and use descriptions for audio or video assets when present.',
			'Prefer focused, working code over broad rewrites. Run lightweight checks only when useful.',
			'',
			`Workflow kind: ${request.kind}`,
			modeInstruction,
			'',
			`Template: ${state.templateName || 'unknown'}`,
			`Project type: ${state.projectType || 'unknown'}`,
			'',
			'Original project brief:',
			originalRequest,
			'',
			'Latest request:',
			request.query,
			postValidationContext,
			latestUploadedAssetContext ? `\n${latestUploadedAssetContext}` : '',
		].join('\n');
	}

	private buildCodexConfig(runtime: CodexRuntime): string {
		const lines = [
			runtime.model ? `model = ${tomlString(runtime.model)}` : undefined,
			runtime.baseUrl ? `model_provider = ${tomlString(runtime.modelProvider)}` : undefined,
			runtime.reasoningEffort ? `model_reasoning_effort = ${tomlString(runtime.reasoningEffort)}` : undefined,
			'disable_response_storage = true',
			'preferred_auth_method = "apikey"',
			'',
		].filter((line): line is string => line !== undefined);

		if (runtime.baseUrl) {
			lines.push(
				`[model_providers.${runtime.modelProvider}]`,
				`name = ${tomlString(runtime.modelProvider)}`,
				`base_url = ${tomlString(runtime.baseUrl)}`,
				'wire_api = "responses"',
				'requires_openai_auth = true',
				'',
			);
		}

		return lines.join('\n');
	}
	}
