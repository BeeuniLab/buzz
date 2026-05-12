import { OpenAI } from 'openai';
import { Stream } from 'openai/streaming';
import { z } from 'zod';
import {
    type SchemaFormat,
    type FormatterOptions,
    generateTemplateForSchema,
    parseContentForSchema,
} from './schemaFormatters';
import { zodTextFormat } from 'openai/helpers/zod.mjs';
import {
    ChatCompletionMessageFunctionToolCall,
    type ReasoningEffort,
} from 'openai/resources.mjs';
import type {
    FunctionTool,
    Response,
    ResponseCreateParamsBase,
    ResponseFunctionToolCall,
    ResponseInput,
    ResponseInputContent,
    ResponseInputItem,
    ResponseOutputItem,
    ResponseStreamEvent,
} from 'openai/resources/responses/responses.mjs';
import { CompletionSignal, Message, MessageContent, MessageRole } from './common';
import { ToolCallResult, ToolDefinition, toOpenAITool } from '../tools/types';
import { AgentActionKey, AI_MODEL_CONFIG, AIModelConfig, AIModels, InferenceMetadata, normalizeAIModelId, type InferenceRuntimeOverrides } from './config.types';
import { RateLimitService } from '../../services/rate-limit/rateLimits';
import { getUserConfigurableSettings } from '../../config';
import { SecurityError, RateLimitExceededError } from 'shared/types/errors';
import { RateLimitType } from 'worker/services/rate-limit/config';
import { getMaxToolCallingDepth, MAX_LLM_MESSAGES } from '../constants';
import { executeToolCallsWithDependencies } from './toolExecution';
import { CompletionDetector } from './completionDetection';

function optimizeInputs(messages: Message[]): Message[] {
    return messages.map((message) => ({
        ...message,
        content: optimizeMessageContent(message.content),
    }));
}

// Streaming tool-call accumulation helpers 
type ToolAccumulatorEntry = ChatCompletionMessageFunctionToolCall & { index?: number; __order: number };

function synthIdForIndex(i: number): string {
    return `tool_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}`;
}

function getOrCreateResponseToolCallEntry(
    byIndex: Map<number, ToolAccumulatorEntry>,
    byItemId: Map<string, ToolAccumulatorEntry>,
    outputIndex: number | undefined,
    itemId: string | undefined,
    orderCounterRef: { value: number },
): ToolAccumulatorEntry {
    let entry: ToolAccumulatorEntry | undefined;

    if (itemId && byItemId.has(itemId)) {
        entry = byItemId.get(itemId)!;
    } else if (outputIndex !== undefined && byIndex.has(outputIndex)) {
        entry = byIndex.get(outputIndex)!;
    } else {
        const provisionalId = itemId || synthIdForIndex(outputIndex ?? byItemId.size);
        entry = {
            id: provisionalId,
            type: 'function',
            function: {
                name: '',
                arguments: '',
            },
            __order: orderCounterRef.value++,
            ...(outputIndex !== undefined ? { index: outputIndex } : {}),
        };
        if (outputIndex !== undefined) byIndex.set(outputIndex, entry);
    }

    if (itemId) {
        byItemId.set(itemId, entry);
    }

    if (outputIndex !== undefined && entry.index === undefined) {
        entry.index = outputIndex;
        byIndex.set(outputIndex, entry);
    }

    return entry;
}

function applyResponseFunctionCallItem(
    byIndex: Map<number, ToolAccumulatorEntry>,
    byItemId: Map<string, ToolAccumulatorEntry>,
    item: ResponseFunctionToolCall,
    outputIndex: number | undefined,
    orderCounterRef: { value: number },
): void {
    const itemId = item.id ?? item.call_id;
    const entry = getOrCreateResponseToolCallEntry(byIndex, byItemId, outputIndex, itemId, orderCounterRef);

    if (item.call_id && entry.id !== item.call_id) {
        entry.id = item.call_id;
    }

    if (item.name) {
        entry.function.name = item.name;
    }

    if (item.arguments !== undefined) {
        entry.function.arguments = item.arguments;
    }
}

function appendResponseFunctionArguments(
    byIndex: Map<number, ToolAccumulatorEntry>,
    byItemId: Map<string, ToolAccumulatorEntry>,
    outputIndex: number | undefined,
    itemId: string | undefined,
    delta: string,
    orderCounterRef: { value: number },
): void {
    const entry = getOrCreateResponseToolCallEntry(byIndex, byItemId, outputIndex, itemId, orderCounterRef);
    entry.function.arguments += delta;
}

function setResponseFunctionArguments(
    byIndex: Map<number, ToolAccumulatorEntry>,
    byItemId: Map<string, ToolAccumulatorEntry>,
    outputIndex: number | undefined,
    itemId: string | undefined,
    args: string,
    orderCounterRef: { value: number },
): void {
    const entry = getOrCreateResponseToolCallEntry(byIndex, byItemId, outputIndex, itemId, orderCounterRef);
    entry.function.arguments = args;
}

function isResponseFunctionToolCall(item: ResponseOutputItem | ResponseInputItem): item is ResponseFunctionToolCall {
    return item.type === 'function_call';
}

function responseFunctionToolCallToChatToolCall(
    item: ResponseFunctionToolCall,
    fallbackIndex: number,
): ChatCompletionMessageFunctionToolCall {
    return {
        id: item.call_id || item.id || synthIdForIndex(fallbackIndex),
        type: 'function',
        function: {
            name: item.name,
            arguments: item.arguments || '{}',
        },
    };
}

function uniqueToolAccumulatorEntries(entries: ToolAccumulatorEntry[]): ToolAccumulatorEntry[] {
    const seen = new Set<ToolAccumulatorEntry>();
    const unique: ToolAccumulatorEntry[] = [];
    for (const entry of entries) {
        if (!seen.has(entry)) {
            seen.add(entry);
            unique.push(entry);
        }
    }
    return unique;
}

function assembleToolCalls(
    byIndex: Map<number, ToolAccumulatorEntry>,
    byItemId: Map<string, ToolAccumulatorEntry>
): ChatCompletionMessageFunctionToolCall[] {
    if (byIndex.size > 0) {
        return Array.from(byIndex.values())
            .sort((a, b) => (a.index! - b.index!))
            .map((e) => ({ id: e.id, type: 'function' as const, function: { name: e.function.name, arguments: e.function.arguments } }));
    }
    return uniqueToolAccumulatorEntries(Array.from(byItemId.values()))
        .sort((a, b) => a.__order - b.__order)
        .map((e) => ({ id: e.id, type: 'function' as const, function: { name: e.function.name, arguments: e.function.arguments } }));
}

function optimizeMessageContent(content: MessageContent): MessageContent {
    if (!content) return content;
    // If content is an array (TextContent | ImageContent), only optimize text content
    if (Array.isArray(content)) {
        return content.map((item) =>
            item.type === 'text'
                ? { ...item, text: optimizeTextContent(item.text) }
                : item,
        );
    }

    // If content is a string, optimize it directly
    return optimizeTextContent(content);
}

function optimizeTextContent(content: string): string {
    // CONSERVATIVE OPTIMIZATION - Only safe changes that preserve readability

    // 1. Remove trailing whitespace from lines (always safe)
    content = content.replace(/[ \t]+$/gm, '');

    // 2. Reduce excessive empty lines (more than 3 consecutive) to 2 max
    // This preserves intentional spacing while removing truly excessive gaps
    content = content.replace(/\n\s*\n\s*\n\s*\n+/g, '\n\n\n');

    // // Convert 4-space indentation to 2-space for non-Python/YAML content
    // content = content.replace(/^( {4})+/gm, (match) =>
    // 	'  '.repeat(match.length / 4),
    // );

    // // Convert 8-space indentation to 2-space
    // content = content.replace(/^( {8})+/gm, (match) =>
    // 	'  '.repeat(match.length / 8),
    // );
    // 4. Remove leading/trailing whitespace from the entire content
    // (but preserve internal structure)
    content = content.trim();

    return content;
}

function buildGatewayPathname(cleanPathname: string, providerOverride?: AIGatewayProviders): string {
    return providerOverride ? `${cleanPathname}/${providerOverride}` : `${cleanPathname}/compat`;
}

function constructGatewayUrl(url: URL, providerOverride?: AIGatewayProviders): string {
    const cleanPathname = url.pathname.replace(/\/$/, '');
    url.pathname = buildGatewayPathname(cleanPathname, providerOverride);
    return url.toString();
}

export async function buildGatewayUrl(
	env: Env,
	providerOverride?: AIGatewayProviders,
	gatewayOverride?: { baseUrl: string; token: string },
): Promise<string> {
    // Runtime override (SDK): explicit AI Gateway base URL
    if (gatewayOverride?.baseUrl) {
        const url = new URL(gatewayOverride.baseUrl);
        return constructGatewayUrl(url, providerOverride);
    }

    // If CLOUDFLARE_AI_GATEWAY_URL is set and is a valid URL, use it directly
    if (env.CLOUDFLARE_AI_GATEWAY_URL && 
        env.CLOUDFLARE_AI_GATEWAY_URL !== 'none' && 
        env.CLOUDFLARE_AI_GATEWAY_URL.trim() !== '') {
        
        try {
            const url = new URL(env.CLOUDFLARE_AI_GATEWAY_URL);
            // Validate it's actually an HTTP/HTTPS URL
            if (url.protocol === 'http:' || url.protocol === 'https:') {
                // Add 'providerOverride' as a segment to the URL
                const cleanPathname = url.pathname.replace(/\/$/, ''); // Remove trailing slash
                url.pathname = buildGatewayPathname(cleanPathname, providerOverride);
                return url.toString();
            }
        } catch (error) {
            // Invalid URL, fall through to use bindings
            console.warn(`Invalid CLOUDFLARE_AI_GATEWAY_URL provided: ${env.CLOUDFLARE_AI_GATEWAY_URL}. Falling back to AI bindings.`);
        }
    }
    
    // Build the url via bindings
    const gateway = env.AI.gateway(env.CLOUDFLARE_AI_GATEWAY);
    const baseUrl = providerOverride ? await gateway.getUrl(providerOverride) : `${await gateway.getUrl()}compat`;
    return baseUrl;
}

function isValidApiKey(apiKey: string): boolean {
    if (!apiKey || apiKey.trim() === '') {
        return false;
    }
    // Check if value is not 'default' or 'none' and is more than 10 characters long
    if (apiKey.trim().toLowerCase() === 'default' || apiKey.trim().toLowerCase() === 'none' || apiKey.trim().length < 10) {
        return false;
    }
    return true;
}

function normalizeParsedSchemaContent(
    _actionKey: AgentActionKey | 'testModelConfig',
    parsedContent: unknown,
): unknown {
    return parsedContent;
}

function extractFirstBalancedJson(content: string): string | null {
    const start = content.search(/[\[{]/);
    if (start === -1) return null;

    const stack: string[] = [];
    let inString = false;
    let escaped = false;

    for (let i = start; i < content.length; i++) {
        const char = content[i];

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

        if (char === '{' || char === '[') {
            stack.push(char);
            continue;
        }

        if (char === '}' || char === ']') {
            const expected = char === '}' ? '{' : '[';
            if (stack.pop() !== expected) {
                return null;
            }

            if (stack.length === 0) {
                return content.slice(start, i + 1);
            }
        }
    }

    return null;
}

function parseJsonSchemaContent(content: string): unknown {
    const trimmed = content.trim();

    try {
        return JSON.parse(trimmed);
    } catch (directError) {
        const fencedBlocks = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
        for (const block of fencedBlocks) {
            try {
                return JSON.parse(block[1].trim());
            } catch {
                // Keep trying other fenced blocks or a balanced JSON excerpt.
            }
        }

        const jsonExcerpt = extractFirstBalancedJson(trimmed);
        if (jsonExcerpt) {
            try {
                return JSON.parse(jsonExcerpt);
            } catch {
                // Re-throw the original error so logs point to the raw model output.
            }
        }

        throw directError;
    }
}

function contentToPlainText(content: MessageContent): string {
    if (!content) return '';
    if (typeof content === 'string') return content;

    return content
        .map((item) => {
            switch (item.type) {
                case 'text':
                    return item.text;
                case 'image_url':
                    return `[image: ${item.image_url.url}]`;
                case 'input_audio':
                    return `[audio: ${item.input_audio.format}]`;
                case 'file':
                    return `[file: ${item.file.filename ?? 'uploaded file'}]`;
                default:
                    return '';
            }
        })
        .filter(Boolean)
        .join('\n');
}

function contentToResponseInputContent(content: MessageContent): string | ResponseInputContent[] {
    if (!content) return '';
    if (typeof content === 'string') return content;

    return content.map((item): ResponseInputContent => {
        switch (item.type) {
            case 'text':
                return { type: 'input_text', text: item.text };
            case 'image_url':
                return {
                    type: 'input_image',
                    image_url: item.image_url.url,
                    detail: item.image_url.detail ?? 'auto',
                };
            case 'input_audio':
                return {
                    type: 'input_audio',
                    input_audio: item.input_audio,
                };
            case 'file':
                return {
                    type: 'input_file',
                    file_data: item.file.file_data,
                    filename: item.file.filename,
                };
            default:
                return { type: 'input_text', text: '' };
        }
    });
}

function chatToolCallToResponseFunctionCall(toolCall: ChatCompletionMessageFunctionToolCall): ResponseFunctionToolCall {
    return {
        type: 'function_call',
        call_id: toolCall.id,
        name: toolCall.function.name,
        arguments: toolCall.function.arguments || '{}',
    };
}

function buildResponsesInput(messages: Message[]): { instructions: string; input: ResponseInput } {
    const instructionParts: string[] = [];
    const input: ResponseInput = [];

    for (const message of messages) {
        if (message.role === 'system') {
            const text = contentToPlainText(message.content);
            if (text.trim()) instructionParts.push(text);
            continue;
        }

        if (message.role === 'tool' || message.role === 'function') {
            if (!message.tool_call_id) {
                console.warn('[RESPONSES_INPUT] Dropping tool output without tool_call_id:', message.name);
                continue;
            }
            input.push({
                type: 'function_call_output',
                call_id: message.tool_call_id,
                output: contentToPlainText(message.content) || 'done',
            });
            continue;
        }

        const responseContent = contentToResponseInputContent(message.content);
        const hasContent = Array.isArray(responseContent)
            ? responseContent.length > 0
            : responseContent.trim().length > 0;

        if (hasContent) {
            input.push({
                type: 'message',
                role: message.role === 'assistant' ? 'assistant' : 'user',
                content: responseContent,
            } as ResponseInputItem);
        }

        if (message.role === 'assistant' && message.tool_calls?.length) {
            input.push(...message.tool_calls.map(chatToolCallToResponseFunctionCall));
        }
    }

    return {
        // The configured GPT proxy rejects Responses requests with no instructions.
        instructions: instructionParts.join('\n\n') || 'Follow the user request.',
        input,
    };
}

function chatToolToResponseTool(tool: ToolDefinition<unknown, unknown>): FunctionTool {
    const openAITool = toOpenAITool(tool);
    return {
        type: 'function',
        name: openAITool.function.name,
        description: openAITool.function.description,
        parameters: openAITool.function.parameters as Record<string, unknown>,
        strict: false,
    };
}

function extractResponseContent(response: Response): string {
    if (typeof response.output_text === 'string' && response.output_text.length > 0) {
        return response.output_text;
    }

    return response.output.map(extractOutputTextFromResponseItem).join('');
}

function extractOutputTextFromResponseItem(item: ResponseOutputItem): string {
    if (item.type !== 'message') return '';
    return item.content
        .map((part) => part.type === 'output_text' ? part.text : '')
        .filter(Boolean)
        .join('');
}

function extractResponseToolCalls(response: Response): ChatCompletionMessageFunctionToolCall[] {
    return response.output
        .map((item, index) => isResponseFunctionToolCall(item) ? responseFunctionToolCallToChatToolCall(item, index) : null)
        .filter((item): item is ChatCompletionMessageFunctionToolCall => Boolean(item));
}

function isAbortLikeError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }
    return error.name === 'AbortError'
        || error.message?.includes('aborted')
        || error.message?.includes('abort');
}

function hasValidProxyConfig(url: string | undefined, apiKey: string | undefined): boolean {
    return Boolean(url && isValidApiKey(apiKey || ''));
}

async function getApiKey(
	provider: string,
	env: Env,
	_userId: string,
	runtimeOverrides?: InferenceRuntimeOverrides,
): Promise<string> {
    console.log("Getting API key for provider: ", provider);

    const runtimeKey = runtimeOverrides?.userApiKeys?.[provider];
    if (runtimeKey && isValidApiKey(runtimeKey)) {
        return runtimeKey;
    }
    // Fallback to environment variables
    const providerKeyString = provider.toUpperCase().replaceAll('-', '_');
    const envKey = `${providerKeyString}_API_KEY` as keyof Env;
    let apiKey: string = env[envKey] as string;
    
    // Check if apiKey is empty or undefined and is valid
    if (!isValidApiKey(apiKey)) {
        // only use platform token if NOT using a custom gateway URL
        // User's gateway = user's credentials only
        if (runtimeOverrides?.aiGatewayOverride?.baseUrl) {
            // User provided custom gateway
            apiKey = runtimeOverrides.aiGatewayOverride.token ?? '';
        } else {
            apiKey = runtimeOverrides?.aiGatewayOverride?.token ?? env.CLOUDFLARE_AI_GATEWAY_TOKEN;
        }
    }
    return apiKey;
}

export async function getConfigurationForModel(
    modelConfig: AIModelConfig,
    env: Env,
    userId: string,
    runtimeOverrides?: InferenceRuntimeOverrides,
    useFallbackProxy: boolean = false,
): Promise<{
    baseURL: string,
    apiKey: string,
    defaultHeaders?: Record<string, string>,
}> {
    const hasPrimaryLlmProxy = hasValidProxyConfig(env.LLM_PROXY_URL, env.LLM_PROXY_API_KEY);
    const hasFallbackLlmProxy = hasValidProxyConfig(env.LLM_PROXY_FALLBACK_URL, env.LLM_PROXY_FALLBACK_API_KEY);

    if (modelConfig.name === AI_MODEL_CONFIG[AIModels.OPENAI_5_5].name && !hasPrimaryLlmProxy && !hasFallbackLlmProxy) {
        throw new Error('LLM_PROXY_API_KEY or LLM_PROXY_FALLBACK_API_KEY is required for GPT-5.5 agent inference via the configured LLM proxy.');
    }

    if (useFallbackProxy && hasFallbackLlmProxy) {
        return {
            baseURL: env.LLM_PROXY_FALLBACK_URL,
            apiKey: env.LLM_PROXY_FALLBACK_API_KEY,
        };
    }

    // Custom LLM proxy: when LLM_PROXY_URL is set, route all requests through it
    // This supports OpenAI-compatible proxies (e.g. newapi, one-api) that handle
    // multi-provider routing internally via the model name.
    if (hasPrimaryLlmProxy) {
        return {
            baseURL: env.LLM_PROXY_URL,
            apiKey: env.LLM_PROXY_API_KEY,
        };
    }

    if (hasFallbackLlmProxy) {
        return {
            baseURL: env.LLM_PROXY_FALLBACK_URL,
            apiKey: env.LLM_PROXY_FALLBACK_API_KEY,
        };
    }

    // Vercel AI Gateway: unified endpoint that expects provider/model format
    if (env.VERCEL_AI_GATEWAY_API_KEY) {
        return {
            baseURL: 'https://ai-gateway.vercel.sh/v1',
            apiKey: env.VERCEL_AI_GATEWAY_API_KEY,
        };
    }

    let providerForcedOverride: AIGatewayProviders | undefined;
    if (modelConfig.directOverride) {
        switch(modelConfig.provider) {
            case 'openrouter':
                return {
                    baseURL: 'https://openrouter.ai/api/v1',
                    apiKey: env.OPENROUTER_API_KEY,
                };
            case 'google-ai-studio':
                return {
                    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
                    apiKey: env.GOOGLE_AI_STUDIO_API_KEY,
                };
            case 'anthropic':
                return {
                    baseURL: 'https://api.anthropic.com/v1/',
                    apiKey: env.ANTHROPIC_API_KEY,
                };
            default:
                providerForcedOverride = modelConfig.provider as AIGatewayProviders;
                break;
        }
    }

    const gatewayOverride = runtimeOverrides?.aiGatewayOverride;
    const isUsingCustomGateway = !!gatewayOverride?.baseUrl;
    const baseURL = await buildGatewayUrl(env, providerForcedOverride, gatewayOverride);

    const gatewayToken = isUsingCustomGateway
        ? gatewayOverride?.token
        : (gatewayOverride?.token ?? env.CLOUDFLARE_AI_GATEWAY_TOKEN);  // Platform gateway

    // Try to find API key of type <PROVIDER>_API_KEY else default to gateway token
    const apiKey = await getApiKey(modelConfig.provider, env, userId, runtimeOverrides);

    // AI Gateway wholesaling: when using BYOK provider key + platform gateway token
    const defaultHeaders = gatewayToken && apiKey !== gatewayToken ? {
        'cf-aig-authorization': `Bearer ${gatewayToken}`,
    } : undefined;
    return {
        baseURL,
        apiKey,
        defaultHeaders
    };
}

type InferArgsBase = {
    env: Env;
    metadata: InferenceMetadata;
    actionKey: AgentActionKey  | 'testModelConfig';
    messages: Message[];
    maxTokens?: number;
    modelName: AIModels | string;
    reasoning_effort?: ReasoningEffort;
    temperature?: number;
    frequency_penalty?: number;
    stream?: {
        chunk_size: number;
        onChunk: (chunk: string) => void;
    };
    tools?: ToolDefinition<any, any>[];
    providerOverride?: 'cloudflare' | 'direct';
    useFallbackProxy?: boolean;
    runtimeOverrides?: InferenceRuntimeOverrides;
    abortSignal?: AbortSignal;
    onAssistantMessage?: (message: Message) => Promise<void>;
    completionConfig?: CompletionConfig;
};

type InferArgsStructured = InferArgsBase & {
    schema: z.AnyZodObject;
    schemaName: string;
};

type InferWithCustomFormatArgs = InferArgsStructured & {
    format?: SchemaFormat;
    formatOptions?: FormatterOptions;
};

export interface ToolCallContext {
    messages: Message[];
    depth: number;
    completionSignal?: CompletionSignal;
    warningInjected?: boolean;
}

/**
 * Configuration for completion signal detection and auto-warning injection.
 */
export interface CompletionConfig {
    detector?: CompletionDetector;
    operationalMode?: 'initial' | 'followup';
    allowWarningInjection?: boolean;
}

export function serializeCallChain(context: ToolCallContext, finalResponse: string): string {
    // Build a transcript of the tool call messages, and append the final response
    let transcript = '**Request terminated by user, partial response transcript (last 5 messages):**\n\n<call_chain_transcript>';
    for (const message of context.messages.slice(-5)) {
        let content = message.content;
        
        // Truncate tool messages to 100 chars
        if (message.role === 'tool' || message.role === 'function') {
            content = (content || '').slice(0, 100);
        }
        
        transcript += `<message role="${message.role}">${content}</message>`;
    }
    transcript += `<final_response>${finalResponse || '**cancelled**'}</final_response>`;
    transcript += '</call_chain_transcript>';
    return transcript;
}

export class InferError extends Error {
    constructor(
        message: string,
        public response: string,
        public toolCallContext?: ToolCallContext
    ) {
        super(message);
        this.name = 'InferError';
    }

    partialResponseTranscript(): string {
        if (!this.toolCallContext) {
            return this.response;
        }
        return serializeCallChain(this.toolCallContext, this.response);
    }

    partialResponse(): InferResponseString {
        return {
            string: this.response,
            toolCallContext: this.toolCallContext
        };
    }
}

export class AbortError extends InferError {
    constructor(response: string, toolCallContext?: ToolCallContext) {
        super(response, response, toolCallContext);
        this.name = 'AbortError';
    }
}

export type InferResponseObject<OutputSchema extends z.AnyZodObject> = {
    object: z.infer<OutputSchema>;
    toolCallContext?: ToolCallContext;
};

export type InferResponseString = {
    string: string;
    toolCallContext?: ToolCallContext;
};

/**
 * Execute all tool calls from OpenAI response
 */
async function executeToolCalls(openAiToolCalls: ChatCompletionMessageFunctionToolCall[], originalDefinitions: ToolDefinition[]): Promise<ToolCallResult[]> {
    // Use dependency-aware execution engine
    return executeToolCallsWithDependencies(openAiToolCalls, originalDefinitions);
}

function updateToolCallContext(
    toolCallContext: ToolCallContext | undefined,
    assistantMessage: Message,
    executedToolCalls: ToolCallResult[],
    completionDetector?: CompletionDetector
) {
    const newMessages = [
        ...(toolCallContext?.messages || []),
        assistantMessage,
        ...executedToolCalls
            .filter(result => result.name && result.name.trim() !== '')
            .map((result, _) => ({
                role: "tool" as MessageRole,
                content: result.result ? JSON.stringify(result.result) : 'done',
                name: result.name,
                tool_call_id: result.id,
            })),
        ];

    const newDepth = (toolCallContext?.depth ?? 0) + 1;

    // Detect completion signal from executed tool calls
    let completionSignal = toolCallContext?.completionSignal;
    if (completionDetector && !completionSignal) {
        completionSignal = completionDetector.detectCompletion(executedToolCalls);
    }

    const newToolCallContext: ToolCallContext = {
        messages: newMessages,
        depth: newDepth,
        completionSignal,
        warningInjected: toolCallContext?.warningInjected || false
    };
    return newToolCallContext;
}

export function infer<OutputSchema extends z.AnyZodObject>(
    args: InferArgsStructured,
    toolCallContext?: ToolCallContext,
): Promise<InferResponseObject<OutputSchema>>;

export function infer(args: InferArgsBase, toolCallContext?: ToolCallContext): Promise<InferResponseString>;

export function infer<OutputSchema extends z.AnyZodObject>(
    args: InferWithCustomFormatArgs,
    toolCallContext?: ToolCallContext,
): Promise<InferResponseObject<OutputSchema>>;

/**
 * Perform an inference using OpenAI's structured output with JSON schema
 * This uses the response_format.schema parameter to ensure the model returns
 * a response that matches the provided schema.
 */
export async function infer<OutputSchema extends z.AnyZodObject>({
    env,
    metadata,
    messages,
    schema,
    schemaName,
    actionKey,
    format,
    formatOptions,
    modelName,
    reasoning_effort,
    temperature,
    frequency_penalty,
    maxTokens,
    stream,
    tools,
    useFallbackProxy,
    runtimeOverrides,
    abortSignal,
    onAssistantMessage,
    completionConfig,
}: InferArgsBase & {
    schema?: OutputSchema;
    schemaName?: string;
    format?: SchemaFormat;
    formatOptions?: FormatterOptions;
}, toolCallContext?: ToolCallContext): Promise<InferResponseObject<OutputSchema> | InferResponseString> {
    if (messages.length > MAX_LLM_MESSAGES) {
        throw new RateLimitExceededError(`Message limit exceeded: ${messages.length} messages (max: ${MAX_LLM_MESSAGES}). Please use context compactification.`, RateLimitType.LLM_CALLS);
    }
    
    // Check tool calling depth to prevent infinite recursion
    const currentDepth = toolCallContext?.depth ?? 0;
    if (currentDepth >= getMaxToolCallingDepth(actionKey)) {
        console.warn(`Tool calling depth limit reached (${currentDepth}/${getMaxToolCallingDepth(actionKey)}). Stopping recursion.`);
        // Return a response indicating max depth reached
        if (schema) {
            throw new AbortError(`Maximum tool calling depth (${getMaxToolCallingDepth(actionKey)}) exceeded. Tools may be calling each other recursively.`, toolCallContext);
        }
        return { 
            string: `[System: Maximum tool calling depth reached.]`,
            toolCallContext 
        };
    }
    
    try {
        const userConfig = await getUserConfigurableSettings(env, metadata.userId)
        // Maybe in the future can expand using config object for other stuff like global model configs?
        modelName = normalizeAIModelId(modelName) as AIModels | string;
        await RateLimitService.enforceLLMCallsRateLimit(env, userConfig.security.rateLimit, metadata.userId, modelName)
        const modelConfig = AI_MODEL_CONFIG[modelName as AIModels];
        if (!modelConfig) {
            throw new Error(`Unknown AI model configuration: ${modelName}`);
        }

        const { apiKey, baseURL, defaultHeaders } = await getConfigurationForModel(
            modelConfig,
            env,
            metadata.userId,
            runtimeOverrides,
            useFallbackProxy,
        );
        console.log(`baseUrl: ${baseURL}, modelName: ${modelName}`);

        // Remove [*.] from model name
        const requestModelName = modelName.replace(/\[.*?\]/, '');

        // Strip provider prefix (e.g. "openai/gpt-5.5" -> "gpt-5.5")
        // when using LLM proxy, as proxies expect bare model names.
        const usingConfiguredLlmProxy = (
            hasValidProxyConfig(env.LLM_PROXY_URL, env.LLM_PROXY_API_KEY) && baseURL === env.LLM_PROXY_URL
        ) || (
            hasValidProxyConfig(env.LLM_PROXY_FALLBACK_URL, env.LLM_PROXY_FALLBACK_API_KEY) && baseURL === env.LLM_PROXY_FALLBACK_URL
        );
        const apiModelName = usingConfiguredLlmProxy && requestModelName.includes('/')
            ? requestModelName.split('/').slice(1).join('/')
            : requestModelName;

        const client = new OpenAI({ apiKey, baseURL: baseURL, defaultHeaders });
        const textOpts =
            schema && schemaName && !format
                ? { text: { format: zodTextFormat(schema, schemaName) } }
                : {};

        // Optimize messages to reduce token count
        const optimizedMessages = optimizeInputs(messages);
        console.log(`Token optimization: Original messages size ~${JSON.stringify(messages).length} chars, optimized size ~${JSON.stringify(optimizedMessages).length} chars`);

        let messagesToPass = [...optimizedMessages];
        if (toolCallContext && toolCallContext.messages) {
            const ctxMessages = toolCallContext.messages;
            let validToolCallIds = new Set<string>();

            let filtered = ctxMessages.filter(msg => {
                // Update valid IDs when we see assistant with tool_calls
                if (msg.role === 'assistant' && msg.tool_calls) {
                    validToolCallIds = new Set(msg.tool_calls.map(tc => tc.id));
                    return true;
                }

                // Filter tool messages
                if (msg.role === 'tool') {
                    if (!msg.name?.trim()) {
                        console.warn('[TOOL_ORPHAN] Dropping tool message with empty name:', msg.tool_call_id);
                        return false;
                    }
                    if (!msg.tool_call_id || !validToolCallIds.has(msg.tool_call_id)) {
                        console.warn('[TOOL_ORPHAN] Dropping orphaned tool message:', msg.name, msg.tool_call_id);
                        return false;
                    }
                }

                return true;
            });

            // Remove empty tool call arrays from assistant messages
            filtered = filtered.map(msg => {
                if (msg.role === 'assistant' && msg.tool_calls) {
                    msg.tool_calls = msg.tool_calls.filter(tc => tc.id);
                    if (msg.tool_calls.length === 0) {
                        msg.tool_calls = undefined;
                    }
                }
                return msg;
            });

            messagesToPass.push(...filtered);
        }

        if (format) {
            if (!schema || !schemaName) {
                throw new Error('Schema and schemaName are required when using a custom format');
            }
            const formatInstructions = generateTemplateForSchema(
                schema,
                format,
                formatOptions,
            );
            const lastMessage = messagesToPass[messagesToPass.length - 1];

            // Handle multi-modal content properly
            if (typeof lastMessage.content === 'string') {
                // Simple string content - append format instructions
                messagesToPass = [
                    ...messagesToPass.slice(0, -1),
                    {
                        role: lastMessage.role,
                        content: `${lastMessage.content}\n\n${formatInstructions}`,
                    },
                ];
            } else if (Array.isArray(lastMessage.content)) {
                // Multi-modal content - append format instructions to the text part
                const updatedContent = lastMessage.content.map((item) => {
                    if (item.type === 'text') {
                        return {
                            ...item,
                            text: `${item.text}\n\n${formatInstructions}`,
                        };
                    }
                    return item;
                });
                messagesToPass = [
                    ...messagesToPass.slice(0, -1),
                    {
                        role: lastMessage.role,
                        content: updatedContent,
                    },
                ];
            }
        }

        console.log(`Running inference with ${apiModelName} using Responses API with ${format ?? 'json_schema'} format, reasoning effort: ${reasoning_effort}, configured max tokens: ${maxTokens} (not sent), temperature: ${temperature}, frequency_penalty: ${frequency_penalty} (not sent), baseURL: ${baseURL}`);

        const toolsOpts = tools ? {
            tools: tools.map(chatToolToResponseTool),
            tool_choice: 'auto' as const
        } : {};
        const responsesInput = buildResponsesInput(messagesToPass);
        let response: Response | Stream<ResponseStreamEvent>;
        try {
            const responseParams: ResponseCreateParamsBase = {
                ...textOpts,
                ...toolsOpts,
                model: apiModelName,
                instructions: responsesInput.instructions,
                input: responsesInput.input,
                // The configured GPT proxy returns SSE for /responses even when
                // stream=false, so always use the SDK streaming path and aggregate
                // internally for non-stream callers.
                stream: true,
                store: false,
                reasoning: modelConfig.nonReasoning || !reasoning_effort ? undefined : { effort: reasoning_effort },
                parallel_tool_calls: tools ? true : undefined,
            } as ResponseCreateParamsBase;

            response = await client.responses.create(responseParams, {
                signal: abortSignal,
                headers: {
                    "cf-aig-metadata": JSON.stringify({
                        chatId: metadata.agentId,
                        userId: metadata.userId,
                        schemaName,
                        actionKey,
                    })
                }
            });
            console.log(`Inference response received`);
        } catch (error) {
            // Check if error is due to abort
            if (isAbortLikeError(error)) {
                console.log('Inference cancelled by user');
                throw new AbortError('**User cancelled inference**', toolCallContext);
            }
            
            console.error(`Failed to get inference response from OpenAI: ${error}`);
            // if ((error instanceof Error && error.message.includes('429')) || (typeof error === 'string' && error.includes('429'))) {

            //     throw new RateLimitExceededError('Rate limit exceeded in LLM calls, Please try again later', RateLimitType.LLM_CALLS);
            // }
            throw error;
        }
        let toolCalls: ChatCompletionMessageFunctionToolCall[] = [];

        /*
        * Handle LLM response
        */

        let content = '';
        if (response instanceof Stream) {
                let streamIndex = 0;
                let completedResponse: Response | undefined;
                // Accumulators for Responses function calls: by output index (preferred) and item id.
                const byIndex = new Map<number, ToolAccumulatorEntry>();
                const byItemId = new Map<string, ToolAccumulatorEntry>();
                const orderCounterRef = { value: 0 };
                const flushStreamChunk = (force = false) => {
                    if (!stream) {
                        return;
                    }
                    const slice = content.slice(streamIndex);
                    if (slice.length >= stream.chunk_size || (force && slice.length > 0)) {
                        stream.onChunk(slice);
                        streamIndex += slice.length;
                    }
                };
                
                try {
                    for await (const event of response) {
                        switch (event.type) {
                            case 'response.output_text.delta':
                                content += event.delta || '';
                                flushStreamChunk();
                                break;
                            case 'response.output_text.done':
                                if (!content && event.text) {
                                    content = event.text;
                                }
                                flushStreamChunk(true);
                                break;
                            case 'response.output_item.added':
                            case 'response.output_item.done':
                                if (isResponseFunctionToolCall(event.item)) {
                                    applyResponseFunctionCallItem(
                                        byIndex,
                                        byItemId,
                                        event.item,
                                        event.output_index,
                                        orderCounterRef,
                                    );
                                } else if (event.type === 'response.output_item.done' && !content) {
                                    content = extractOutputTextFromResponseItem(event.item);
                                    flushStreamChunk(true);
                                }
                                break;
                            case 'response.function_call_arguments.delta':
                                appendResponseFunctionArguments(
                                    byIndex,
                                    byItemId,
                                    event.output_index,
                                    event.item_id,
                                    event.delta,
                                    orderCounterRef,
                                );
                                break;
                            case 'response.function_call_arguments.done':
                                setResponseFunctionArguments(
                                    byIndex,
                                    byItemId,
                                    event.output_index,
                                    event.item_id,
                                    event.arguments,
                                    orderCounterRef,
                                );
                                break;
                            case 'response.completed':
                                completedResponse = event.response;
                                break;
                            case 'response.failed':
                                throw new Error(`Responses API failed: ${event.response.error?.message ?? 'unknown error'}`);
                            case 'response.incomplete':
                                console.warn('Responses API returned incomplete response:', event.response.incomplete_details);
                                completedResponse = event.response;
                                break;
                            case 'error':
                                throw new Error(`Responses API stream error: ${event.message}`);
                            default:
                                break;
                        }
                    }
                } catch (error) {
                    if (abortSignal?.aborted || isAbortLikeError(error)) {
                        console.log('Inference stream cancelled by user');
                        throw new AbortError('**User cancelled inference**', toolCallContext);
                    }
                    throw error;
                }

                if (!content && completedResponse) {
                    content = extractResponseContent(completedResponse);
                    flushStreamChunk(true);
                }

                if (completedResponse) {
                    const existingToolCallIds = new Set(
                        uniqueToolAccumulatorEntries([
                            ...Array.from(byIndex.values()),
                            ...Array.from(byItemId.values()),
                        ]).map(entry => entry.id),
                    );
                    for (const responseToolCall of extractResponseToolCalls(completedResponse)) {
                        if (existingToolCallIds.has(responseToolCall.id)) {
                            continue;
                        }
                        const entry = getOrCreateResponseToolCallEntry(
                            byIndex,
                            byItemId,
                            byIndex.size,
                            responseToolCall.id,
                            orderCounterRef,
                        );
                        entry.id = responseToolCall.id;
                        entry.function.name = responseToolCall.function.name;
                        entry.function.arguments = responseToolCall.function.arguments;
                        existingToolCallIds.add(responseToolCall.id);
                    }
                    console.log(`Total tokens used in prompt: ${completedResponse.usage?.total_tokens}`);
                }

                // Assemble toolCalls with preference for index ordering, else first-seen order
                const assembled = assembleToolCalls(byIndex, byItemId);
                const dropped = assembled.filter(tc => !tc.function.name || tc.function.name.trim() === '');
                if (dropped.length) {
                    console.warn(`[TOOL_CALL_WARNING] Dropping ${dropped.length} streamed tool_call(s) without function name`, dropped);
                }
                toolCalls = assembled.filter(tc => tc.function.name && tc.function.name.trim() !== '');
                
                // Validate accumulated tool calls (do not mutate arguments)
                for (const toolCall of toolCalls) {
                    if (!toolCall.function.name) {
                        console.warn('Tool call missing function name:', toolCall);
                    }
                    if (toolCall.function.arguments) {
                        try {
                            // Validate JSON arguments early for visibility
                            const parsed = JSON.parse(toolCall.function.arguments);
                            console.log(`[TOOL_CALL_VALIDATION] Successfully parsed arguments for ${toolCall.function.name}:`, parsed);
                        } catch (error) {
                            console.error(`[TOOL_CALL_VALIDATION] Invalid JSON in tool call arguments for ${toolCall.function.name}:`, {
                                error: error instanceof Error ? error.message : String(error),
                                arguments_length: toolCall.function.arguments.length,
                                arguments_content: toolCall.function.arguments,
                                arguments_hex: Buffer.from(toolCall.function.arguments).toString('hex')
                            });
                        }
                    }
                }
        } else {
            // Fallback for providers that return JSON for Responses despite stream=true.
            const nonStreamResponse = response as Response;
            content = extractResponseContent(nonStreamResponse);
            const allToolCalls = extractResponseToolCalls(nonStreamResponse);
            const droppedNonStream = allToolCalls.filter(tc => !tc.function.name || tc.function.name.trim() === '');
            if (droppedNonStream.length) {
                console.warn(`[TOOL_CALL_WARNING] Dropping ${droppedNonStream.length} non-stream tool_call(s) without function name`, droppedNonStream);
            }
            toolCalls = allToolCalls.filter(tc => tc.function.name && tc.function.name.trim() !== '');
            // Also print the total number of tokens used in the prompt
            const totalTokens = nonStreamResponse.usage?.total_tokens;
            console.log(`Total tokens used in prompt: ${totalTokens}`);
        }

        const assistantMessage = { role: "assistant" as MessageRole, content, tool_calls: toolCalls };

        if (onAssistantMessage) {
            await onAssistantMessage(assistantMessage);
        }

        /*
        * Handle tool calls
        */

        if (!content && !stream && !toolCalls.length) {
            // // Only error if not streaming and no content
            // console.error('No content received from OpenAI', JSON.stringify(response, null, 2));
            // throw new Error('No content received from OpenAI');
            console.warn('No content received from OpenAI', JSON.stringify(response, null, 2));
            return { string: "", toolCallContext };
        }
        let executedToolCalls: ToolCallResult[] = [];
        if (tools) {
            // console.log(`Tool calls:`, JSON.stringify(toolCalls, null, 2), 'definition:', JSON.stringify(tools, null, 2));
            try {
                executedToolCalls = await executeToolCalls(toolCalls, tools);
            } catch (error) {
                console.error(`Tool execution failed${toolCalls.length > 0 ? ` for ${toolCalls[0].function.name}` : ''}:`, error);
                // Check if error is an abort error
                if (error instanceof AbortError) {
                    console.warn(`Tool call was aborted, ending tool call chain with the latest tool call result`);

                    const newToolCallContext = updateToolCallContext(toolCallContext, assistantMessage, executedToolCalls, completionConfig?.detector);
                    return { string: content, toolCallContext: newToolCallContext };
                }
                // Otherwise, continue
            }
        }

        /*
        * Handle tool call results
        */

        if (executedToolCalls.length) {
            console.log(`Tool calls executed:`, JSON.stringify(executedToolCalls, null, 2));

            const newToolCallContext = updateToolCallContext(toolCallContext, assistantMessage, executedToolCalls, completionConfig?.detector);

            // Stop recursion if completion signal detected
            if (newToolCallContext.completionSignal?.signaled) {
                console.log(`[COMPLETION] ${newToolCallContext.completionSignal.toolName} called, stopping recursion`);

                if (schema && schemaName) {
                    throw new AbortError(
                        `Completion signaled: ${newToolCallContext.completionSignal.summary || 'Task complete'}`,
                        newToolCallContext
                    );
                }
                return {
                    string: content || newToolCallContext.completionSignal.summary || 'Task complete',
                    toolCallContext: newToolCallContext
                };
            }

            // Filter completion tools from recursion trigger
            const executedCallsWithResults = executedToolCalls.filter(result =>
                result.result !== undefined &&
                !(completionConfig?.detector?.isCompletionTool(result.name))
            );
            console.log(`${actionKey}: Tool depth ${newToolCallContext.depth}/${getMaxToolCallingDepth(actionKey)}`);
            
            if (executedCallsWithResults.length) {
                if (schema && schemaName) {
                    const output = await infer<OutputSchema>({
                        env,
                        metadata,
                        messages,
                        schema,
                        schemaName,
                        format,
                        formatOptions,
                        actionKey,
                        modelName,
                        maxTokens,
                        stream,
                        tools,
                        useFallbackProxy,
                        reasoning_effort,
                        temperature,
                        frequency_penalty,
                        abortSignal,
                        onAssistantMessage,
                        completionConfig,
                    }, newToolCallContext);
                    return output;
                } else {
                    const output = await infer({
                        env,
                        metadata,
                        messages,
                        modelName,
                        maxTokens,
                        actionKey,
                        stream,
                        tools,
                        useFallbackProxy,
                        reasoning_effort,
                        temperature,
                        frequency_penalty,
                        abortSignal,
                        onAssistantMessage,
                        completionConfig,
                    }, newToolCallContext);
                    return output;
                }
            } else {
                console.log('No tool calls with results');
                return { string: content, toolCallContext: newToolCallContext };
            }
        }

        if (!schema) {
            return { string: content, toolCallContext };
        }

        try {
            // Parse the response
            const parsedContent = format
                ? parseContentForSchema(content, format, schema, formatOptions)
                : parseJsonSchemaContent(content);
            const normalizedContent = normalizeParsedSchemaContent(actionKey, parsedContent);

            // Use Zod's safeParse for proper error handling
            const result = schema.safeParse(normalizedContent);

            if (!result.success) {
                console.log('Raw content:', content);
                console.log('Parsed data:', normalizedContent);
                console.error('Schema validation errors:', result.error.format());
                throw new Error(`Failed to validate AI response against schema: ${result.error.message}`);
            }

            return { object: result.data, toolCallContext };
        } catch (parseError) {
            console.error('Error parsing response:', parseError);
            throw new InferError('Failed to parse response', content, toolCallContext);
        }
    } catch (error) {
        if (error instanceof RateLimitExceededError || error instanceof SecurityError) {
            throw error;
        }
        console.error('Error in inferWithSchemaOutput:', error);
        throw error;
    }
}
