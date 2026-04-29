import { 
    AgentActionKey, 
    AgentConfig, 
    AgentConstraintConfig, 
    AIModels,
} from "./config.types";
import { env } from 'cloudflare:workers';

const PRIMARY_AGENT_MODEL = AIModels.OPENAI_5_5;
const FALLBACK_AGENT_MODEL = AIModels.OPENAI_5_5;
const BLUEPRINT_AGENT_MODEL = AIModels.OPENAI_5_4_MINI;
const ASSET_MEDIA_CAPTION_MODEL = AIModels.GEMINI_3_1_FLASH_LITE_PREVIEW;
const gpt55Only = (): Set<AIModels> => new Set([AIModels.OPENAI_5_5]);
const gpt55OrDisabled = (): Set<AIModels> => new Set([AIModels.DISABLED, AIModels.OPENAI_5_5]);
const blueprintAllowedModels = (): Set<AIModels> => new Set([
    AIModels.OPENAI_5_4_MINI,
    AIModels.OPENAI_5_5,
]);
const assetMediaCaptionAllowedModels = (): Set<AIModels> => new Set([
    AIModels.GEMINI_3_1_FLASH_LITE_PREVIEW,
]);

// Common configs - these are good defaults
const COMMON_AGENT_CONFIGS = {
    screenshotAnalysis: {
        name: PRIMARY_AGENT_MODEL,
        reasoning_effort: 'medium' as const,
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: FALLBACK_AGENT_MODEL,
    },
    realtimeCodeFixer: {
        name: PRIMARY_AGENT_MODEL,
        reasoning_effort: 'medium' as const,
        max_tokens: 32000,
        temperature: 0.2,
        fallbackModel: FALLBACK_AGENT_MODEL,
    },
    fastCodeFixer: {
        name: PRIMARY_AGENT_MODEL,
        reasoning_effort: undefined,
        max_tokens: 64000,
        temperature: 0.0,
        fallbackModel: FALLBACK_AGENT_MODEL,
    },
    templateSelection: {
        name: PRIMARY_AGENT_MODEL,
        max_tokens: 2000,
        fallbackModel: FALLBACK_AGENT_MODEL,
        temperature: 1,
    },
} as const;

const SHARED_IMPLEMENTATION_CONFIG = {
    name: PRIMARY_AGENT_MODEL,
    reasoning_effort: 'medium' as const,
    max_tokens: 48000,
    temperature: 1,
    fallbackModel: FALLBACK_AGENT_MODEL,
};

//======================================================================================
// ATTENTION! Platform config requires specific API keys and Cloudflare AI Gateway setup.
//======================================================================================
/* 
These are the configs used at build.cloudflare.dev 
You may need to provide API keys for these models in your environment or use 
Cloudflare AI Gateway unified billing for seamless model access without managing multiple keys.
*/
const PLATFORM_AGENT_CONFIG: AgentConfig = {
    ...COMMON_AGENT_CONFIGS,
    blueprint: {
        name: BLUEPRINT_AGENT_MODEL,
        reasoning_effort: 'high',
        max_tokens: 20000,
        fallbackModel: BLUEPRINT_AGENT_MODEL,
        temperature: 1.0,
    },
    projectSetup: {
        name: PRIMARY_AGENT_MODEL,
        reasoning_effort: 'medium',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: FALLBACK_AGENT_MODEL,
    },
    phaseGeneration: {
        name: PRIMARY_AGENT_MODEL,
        reasoning_effort: 'medium',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: FALLBACK_AGENT_MODEL,
    },
    firstPhaseImplementation: {
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    phaseImplementation: {
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    conversationalResponse: {
        name: PRIMARY_AGENT_MODEL,
        reasoning_effort: 'medium',
        max_tokens: 4000,
        temperature: 1,
        fallbackModel: FALLBACK_AGENT_MODEL,
    },
    deepDebugger: {
        name: PRIMARY_AGENT_MODEL,
        reasoning_effort: 'high',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: FALLBACK_AGENT_MODEL,
    },
    fileRegeneration: {
        name: PRIMARY_AGENT_MODEL,
        reasoning_effort: 'medium',
        max_tokens: 16000,
        temperature: 0.0,
        fallbackModel: FALLBACK_AGENT_MODEL,
    },
    agenticProjectBuilder: {
        name: PRIMARY_AGENT_MODEL,
        reasoning_effort: 'medium',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: FALLBACK_AGENT_MODEL,
    },
    assetMediaCaption: {
        name: ASSET_MEDIA_CAPTION_MODEL,
        max_tokens: 512,
        fallbackModel: ASSET_MEDIA_CAPTION_MODEL,
    },
};

//======================================================================================
// Default config: GPT-5.5-based for all tasks via the OpenAI-compatible LLM proxy
//======================================================================================
const DEFAULT_AGENT_CONFIG: AgentConfig = {
    ...COMMON_AGENT_CONFIGS,
    templateSelection: {
        name: PRIMARY_AGENT_MODEL,
        max_tokens: 2000,
        fallbackModel: FALLBACK_AGENT_MODEL,
        temperature: 0.6,
    },
    blueprint: {
        name: BLUEPRINT_AGENT_MODEL,
        reasoning_effort: 'high',
        max_tokens: 64000,
        fallbackModel: BLUEPRINT_AGENT_MODEL,
        temperature: 1,
    },
    projectSetup: {
        name: PRIMARY_AGENT_MODEL,
        reasoning_effort: 'medium',
        max_tokens: 48000,
        temperature: 1,
        fallbackModel: FALLBACK_AGENT_MODEL,
    },
    phaseGeneration: {
        name: PRIMARY_AGENT_MODEL,
        reasoning_effort: 'medium',
        max_tokens: 48000,
        temperature: 1,
        fallbackModel: FALLBACK_AGENT_MODEL,
    },
    firstPhaseImplementation: {
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    phaseImplementation: {
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    conversationalResponse: {
        name: PRIMARY_AGENT_MODEL,
        reasoning_effort: 'medium',
        max_tokens: 4000,
        temperature: 0,
        fallbackModel: FALLBACK_AGENT_MODEL,
    },
    deepDebugger: {
        name: PRIMARY_AGENT_MODEL,
        reasoning_effort: 'high',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: FALLBACK_AGENT_MODEL,
    },
    fileRegeneration: {
        name: PRIMARY_AGENT_MODEL,
        reasoning_effort: 'medium',
        max_tokens: 32000,
        temperature: 1,
        fallbackModel: FALLBACK_AGENT_MODEL,
    },
    agenticProjectBuilder: {
        name: PRIMARY_AGENT_MODEL,
        reasoning_effort: 'high',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: FALLBACK_AGENT_MODEL,
    },
    assetMediaCaption: {
        name: ASSET_MEDIA_CAPTION_MODEL,
        max_tokens: 512,
        fallbackModel: ASSET_MEDIA_CAPTION_MODEL,
    },
};

export const AGENT_CONFIG: AgentConfig = env.PLATFORM_MODEL_PROVIDERS 
    ? PLATFORM_AGENT_CONFIG 
    : DEFAULT_AGENT_CONFIG;


export const AGENT_CONSTRAINTS: Map<AgentActionKey, AgentConstraintConfig> = new Map([
	['templateSelection', {
		allowedModels: gpt55Only(),
		enabled: true,
	}],
	['blueprint', {
		allowedModels: blueprintAllowedModels(),
		enabled: true,
	}],
	['projectSetup', {
		allowedModels: gpt55Only(),
		enabled: true,
	}],
	['phaseGeneration', {
		allowedModels: gpt55Only(),
		enabled: true,
	}],
	['phaseImplementation', {
		allowedModels: gpt55Only(),
		enabled: true,
	}],
	['firstPhaseImplementation', {
		allowedModels: gpt55Only(),
		enabled: true,
	}],
	['fileRegeneration', {
		allowedModels: gpt55Only(),
		enabled: true,
	}],
	['screenshotAnalysis', {
		allowedModels: gpt55Only(),
		enabled: true,
	}],
	['fastCodeFixer', {
		allowedModels: gpt55OrDisabled(),
		enabled: true,
	}],
	['realtimeCodeFixer', {
		allowedModels: gpt55OrDisabled(),
		enabled: true,
	}],
	['conversationalResponse', {
		allowedModels: gpt55Only(),
		enabled: true,
	}],
	['deepDebugger', {
		allowedModels: gpt55Only(),
		enabled: true,
	}],
	['agenticProjectBuilder', {
		allowedModels: gpt55Only(),
		enabled: true,
	}],
	['assetMediaCaption', {
		allowedModels: assetMediaCaptionAllowedModels(),
		enabled: true,
	}],
]);
