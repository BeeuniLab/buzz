import { FileOutputType } from '../../schemas';
import { type ActiveWorkflowTask, BaseProjectState } from '../../core/state';
import { BaseSandboxService } from '../../../services/sandbox/BaseSandboxService';
import { DeploymentManager } from './DeploymentManager';
import { BaseAgentService } from './BaseAgentService';
import { ServiceOptions } from '../interfaces/IServiceOptions';

const DEFAULT_CODEX_TIMEOUT_MS = 25 * 60 * 1000;
const DEFAULT_CODEX_MODEL_PROVIDER = 'crs';
const CODEX_WORK_DIR = '.buzz/codex';
const CODEX_HOME_PATH = '.buzz/codex-home';
const CODEX_CONFIG_PATH = `${CODEX_HOME_PATH}/config.toml`;
const CODEX_AUTH_PATH = `${CODEX_HOME_PATH}/auth.json`;
const CHANGED_FILES_PATH = `${CODEX_WORK_DIR}/changed-files.txt`;
const DELETED_FILES_PATH = `${CODEX_WORK_DIR}/deleted-files.txt`;
const PROMPT_PATH = `${CODEX_WORK_DIR}/prompt.md`;
const OUTPUT_PATH = `${CODEX_WORK_DIR}/output.jsonl`;

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
	model?: string;
	timeoutMs?: number;
}

export interface CodexGenerationResult {
	changedFiles: FileOutputType[];
	deletedFiles: string[];
}

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

function resolveCodexRuntime(env: Env, instanceId: string, requestedModel?: string): CodexRuntime {
	const explicitKey = envString(env, 'CODEX_OPENAI_API_KEY');
	const openAiKey = envString(env, 'OPENAI_API_KEY');
	const proxyKey = envString(env, 'LLM_PROXY_API_KEY');
	const fallbackProxyKey = envString(env, 'LLM_PROXY_FALLBACK_API_KEY');
	const explicitBaseUrl = envString(env, 'CODEX_OPENAI_BASE_URL');
	let apiKey: string | undefined;
	let defaultBaseUrl: string | undefined;

	if (explicitKey) {
		apiKey = explicitKey;
	} else if (openAiKey) {
		apiKey = openAiKey;
	} else if (proxyKey) {
		apiKey = proxyKey;
		defaultBaseUrl = envString(env, 'LLM_PROXY_URL');
	} else if (fallbackProxyKey) {
		apiKey = fallbackProxyKey;
		defaultBaseUrl = envString(env, 'LLM_PROXY_FALLBACK_URL') || envString(env, 'LLM_PROXY_URL');
	}

	if (!apiKey) {
		throw new Error('Background generator requires an LLM API key');
	}

	const baseUrl = explicitBaseUrl || defaultBaseUrl;
	const codexHome = workspacePath(instanceId, CODEX_HOME_PATH);
	const reasoningEffort = envString(env, 'CODEX_MODEL_REASONING_EFFORT');
	return {
		envVars: {
			OPENAI_API_KEY: apiKey,
			CODEX_HOME: codexHome,
			...(baseUrl ? { OPENAI_BASE_URL: baseUrl } : {}),
		},
		codexHome,
		model: requestedModel || envString(env, 'CODEX_MODEL'),
		modelProvider: safePathSegment(envString(env, 'CODEX_MODEL_PROVIDER') || DEFAULT_CODEX_MODEL_PROVIDER),
		...(baseUrl ? { baseUrl } : {}),
		...(reasoningEffort ? { reasoningEffort } : {}),
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
		.map((line) => line.trim())
		.filter(Boolean)
		.filter((path) => !path.startsWith('.buzz/'))
		.filter((path) => !path.startsWith('.codex/'))
		.filter((path) => !path.startsWith('.git/'))
		.filter((path) => !path.startsWith('.wrangler/'))
		.filter((path) => !path.startsWith('node_modules/'))
		.filter((path) => !path.startsWith('dist/'))
		.filter((path) => !path.startsWith('build/'))
		.filter((path) => path !== '.reload-trigger');
}

function readReturnedFile(files: Array<{ filePath: string; fileContents: string }>, path: string): string {
	return files.find((file) => file.filePath === path)?.fileContents ?? '';
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

		const preview = await this.deploymentManager.deployToSandbox(
			[],
			false,
			'chore: prepare workspace for background generator',
			false,
		);
		const instanceId = this.getState().sandboxInstanceId || preview?.runId;
		if (!instanceId) {
			throw new Error('Background generator could not prepare a sandbox instance');
		}

		const client = this.deploymentManager.getClient();
		const runtime = resolveCodexRuntime(this.env, instanceId, request.model);
		await this.createGitBaseline(client, instanceId);
		await this.prepareCodexHome(client, instanceId, runtime);
		await this.prepareCodexEnvironment(client, instanceId, runtime);
		await this.writeCodexConfig(client, instanceId, runtime);
		await this.writeCodexAuth(client, instanceId, runtime);
		await this.writePrompt(client, instanceId, this.buildPrompt(request));

		await this.runCodexExec(client, instanceId, request, runtime);
		const changedPaths = await this.collectChangedPaths(client, instanceId);
		const deletedPaths = await this.collectDeletedPaths(client, instanceId);

		logger.info('Codex changed files collected', {
			workflowId: request.workflowId,
			changedCount: changedPaths.length,
			deletedCount: deletedPaths.length,
			changedPaths,
			deletedPaths,
		});

		const changedFiles = await this.readChangedFiles(client, instanceId, changedPaths);
		if (changedFiles.length > 0) {
			await this.fileManager.saveGeneratedFiles(
				changedFiles,
				'feat: apply Codex generated changes',
			);
			await this.deploymentManager.deployToSandbox(
				changedFiles,
				false,
				'feat: apply Codex generated changes',
				false,
			);
		}

		if (deletedPaths.length > 0) {
			this.fileManager.deleteFiles(deletedPaths);
		}

		return { changedFiles, deletedFiles: deletedPaths };
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
		if (!result.success) {
			throw new Error(`Failed to write background generator config: ${result.error || 'unknown error'}`);
		}
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
		if (!result.success) {
			throw new Error(`Failed to write background generator auth: ${result.error || 'unknown error'}`);
		}

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
			'git init',
			'git config user.email "buzzplay-codex@buzzplay.app"',
			'git config user.name "Buzzplay Codex"',
			'git add -A',
			'(git diff --cached --quiet || git commit -m "chore: baseline before codex")',
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
		if (!result.success) {
			throw new Error(`Failed to write background generator prompt: ${result.error || 'unknown error'}`);
		}
	}

	private async runCodexExec(
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
		const resumeCommand = `${codexHomePrefix} codex exec resume --last --all --json --skip-git-repo-check${modelArg} - < ${shellQuote(PROMPT_PATH)}`;
		const newCommand = `${codexHomePrefix} codex exec --json --sandbox workspace-write --skip-git-repo-check${modelArg} - < ${shellQuote(PROMPT_PATH)}`;
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
			`(({ git diff --name-only --diff-filter=ACMRTUXB; git ls-files --others --exclude-standard; } | grep -v '^\\.buzz/' | grep -v '^\\.codex/' | sort -u > ${shellQuote(CHANGED_FILES_PATH)}) || true)`,
			`((git diff --name-only --diff-filter=D | grep -v '^\\.buzz/' | grep -v '^\\.codex/' | sort -u > ${shellQuote(DELETED_FILES_PATH)}) || true)`,
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
		return [
			'You are running inside a Buzzplay project workspace.',
			'Implement the requested project by editing files directly in this repository.',
			'Do not commit changes. Leave the final filesystem state ready for Buzzplay to collect with git diff.',
			'Respect the existing template, framework, and file structure. Do not edit files under .buzz, .codex, .git, .wrangler, node_modules, dist, or build.',
			'Do not modify files listed in .donttouch_files.json if that file exists.',
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
