import { 
    AgentActionKey, 
    AgentConfig, 
    AgentConstraintConfig, 
    AIModels,
    AllModels,
    LiteModels,
    RegularModels,
} from "./config.types";
import { env } from 'cloudflare:workers';

// Common configs - these are good defaults
const COMMON_AGENT_CONFIGS = {
    screenshotAnalysis: {
        name: AIModels.DISABLED,
        reasoning_effort: 'medium' as const,
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: AIModels.GEMINI_3_1_FLASH_LITE_PREVIEW,
    },
    realtimeCodeFixer: {
        name: AIModels.GEMINI_3_1_FLASH_LITE_PREVIEW,
        reasoning_effort: 'low' as const,
        max_tokens: 32000,
        temperature: 0.2,
        fallbackModel: AIModels.GEMINI_3_FLASH_PREVIEW,
    },
    fastCodeFixer: {
        name: AIModels.DISABLED,
        reasoning_effort: undefined,
        max_tokens: 64000,
        temperature: 0.0,
        fallbackModel: AIModels.GEMINI_3_1_PRO_PREVIEW,
    },
    templateSelection: {
        name: AIModels.GEMINI_3_1_FLASH_LITE_PREVIEW,
        max_tokens: 2000,
        fallbackModel: AIModels.GEMINI_3_FLASH_PREVIEW,
        temperature: 1,
    },
} as const;

const SHARED_IMPLEMENTATION_CONFIG = {
    name: AIModels.GEMINI_3_1_FLASH_LITE_PREVIEW,
    reasoning_effort: 'low' as const,
    max_tokens: 48000,
    temperature: 1,
    fallbackModel: AIModels.GEMINI_3_1_PRO_PREVIEW,
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
        name: AIModels.GEMINI_3_1_PRO_PREVIEW,
        reasoning_effort: 'high',
        max_tokens: 20000,
        fallbackModel: AIModels.GEMINI_3_FLASH_PREVIEW,
        temperature: 1.0,
    },
    projectSetup: {
        name: AIModels.GEMINI_3_1_FLASH_LITE_PREVIEW,
        reasoning_effort: 'medium',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: AIModels.GEMINI_3_1_PRO_PREVIEW,
    },
    phaseGeneration: {
        name: AIModels.GEMINI_3_1_FLASH_LITE_PREVIEW,
        reasoning_effort: 'medium',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: AIModels.GEMINI_3_FLASH_PREVIEW,
    },
    firstPhaseImplementation: {
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    phaseImplementation: {
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    conversationalResponse: {
        name: AIModels.GEMINI_3_1_FLASH_LITE_PREVIEW,
        reasoning_effort: 'low',
        max_tokens: 4000,
        temperature: 1,
        fallbackModel: AIModels.GEMINI_3_FLASH_PREVIEW,
    },
    deepDebugger: {
        name: AIModels.GEMINI_3_1_PRO_PREVIEW,
        reasoning_effort: 'high',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: AIModels.GEMINI_3_FLASH_PREVIEW,
    },
    fileRegeneration: {
        name: AIModels.GEMINI_3_1_FLASH_LITE_PREVIEW,
        reasoning_effort: 'low',
        max_tokens: 16000,
        temperature: 0.0,
        fallbackModel: AIModels.GEMINI_3_FLASH_PREVIEW,
    },
    agenticProjectBuilder: {
        name: AIModels.GEMINI_3_1_PRO_PREVIEW,
        reasoning_effort: 'medium',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: AIModels.GEMINI_3_FLASH_PREVIEW,
    },
    assetMediaCaption: {
        name: AIModels.GEMINI_3_1_FLASH_LITE_PREVIEW,
        reasoning_effort: 'low',
        max_tokens: 512,
        temperature: 0,
        fallbackModel: AIModels.GEMINI_3_FLASH_PREVIEW,
    },
};

//======================================================================================
// Default config: Gemini-based for all tasks
//======================================================================================
const DEFAULT_AGENT_CONFIG: AgentConfig = {
    ...COMMON_AGENT_CONFIGS,
    templateSelection: {
        name: AIModels.GEMINI_3_1_FLASH_LITE_PREVIEW,
        max_tokens: 2000,
        fallbackModel: AIModels.GEMINI_3_FLASH_PREVIEW,
        temperature: 0.6,
    },
    blueprint: {
        name: AIModels.GEMINI_3_1_PRO_PREVIEW,
        reasoning_effort: 'high',
        max_tokens: 64000,
        fallbackModel: AIModels.GEMINI_3_FLASH_PREVIEW,
        temperature: 1,
    },
    projectSetup: {
        name: AIModels.GEMINI_3_1_FLASH_LITE_PREVIEW,
        reasoning_effort: 'low',
        max_tokens: 48000,
        temperature: 1,
        fallbackModel: AIModels.GEMINI_3_1_PRO_PREVIEW,
    },
    phaseGeneration: {
        name: AIModels.GEMINI_3_1_FLASH_LITE_PREVIEW,
        reasoning_effort: 'low',
        max_tokens: 48000,
        temperature: 1,
        fallbackModel: AIModels.GEMINI_3_FLASH_PREVIEW,
    },
    firstPhaseImplementation: {
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    phaseImplementation: {
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    conversationalResponse: {
        name: AIModels.GEMINI_3_1_FLASH_LITE_PREVIEW,
        reasoning_effort: 'low',
        max_tokens: 4000,
        temperature: 0,
        fallbackModel: AIModels.GEMINI_3_FLASH_PREVIEW,
    },
    deepDebugger: {
        name: AIModels.GEMINI_3_1_PRO_PREVIEW,
        reasoning_effort: 'high',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: AIModels.GEMINI_3_FLASH_PREVIEW,
    },
    fileRegeneration: {
        name: AIModels.GEMINI_3_1_FLASH_LITE_PREVIEW,
        reasoning_effort: 'low',
        max_tokens: 32000,
        temperature: 1,
        fallbackModel: AIModels.GEMINI_3_FLASH_PREVIEW,
    },
    agenticProjectBuilder: {
        name: AIModels.GEMINI_3_1_PRO_PREVIEW,
        reasoning_effort: 'high',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: AIModels.GEMINI_3_FLASH_PREVIEW,
    },
    assetMediaCaption: {
        name: AIModels.GEMINI_3_1_FLASH_LITE_PREVIEW,
        reasoning_effort: 'low',
        max_tokens: 512,
        temperature: 0,
        fallbackModel: AIModels.GEMINI_3_FLASH_PREVIEW,
    },
};

export const AGENT_CONFIG: AgentConfig = env.PLATFORM_MODEL_PROVIDERS 
    ? PLATFORM_AGENT_CONFIG 
    : DEFAULT_AGENT_CONFIG;


export const AGENT_CONSTRAINTS: Map<AgentActionKey, AgentConstraintConfig> = new Map([
	['fastCodeFixer', {
		allowedModels: new Set([AIModels.DISABLED]),
		enabled: true,
	}],
	['realtimeCodeFixer', {
		allowedModels: new Set([AIModels.DISABLED]),
		enabled: true,
	}],
	['fileRegeneration', {
		allowedModels: new Set(AllModels),
		enabled: true,
	}],
	['phaseGeneration', {
		allowedModels: new Set(AllModels),
		enabled: true,
	}],
	['projectSetup', {
		allowedModels: new Set([...RegularModels, AIModels.GEMINI_3_1_PRO_PREVIEW]),
		enabled: true,
	}],
	['conversationalResponse', {
		allowedModels: new Set(RegularModels),
		enabled: true,
	}],
	['templateSelection', {
		allowedModels: new Set(LiteModels),
		enabled: true,
	}],
	['assetMediaCaption', {
		allowedModels: new Set(LiteModels.filter((id) => id !== AIModels.DISABLED)),
		enabled: true,
	}],
]);