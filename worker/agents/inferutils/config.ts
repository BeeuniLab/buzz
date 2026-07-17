import { 
    AgentActionKey, 
    AgentConfig, 
    AgentConstraintConfig, 
    AIModels,
} from "./config.types";
import { env } from 'cloudflare:workers';

const PRIMARY_AGENT_MODEL = AIModels.OPENAI_5_6_SOL;
const FALLBACK_AGENT_MODEL = AIModels.OPENAI_5_6_SOL;
const gpt56SolOnly = (): Set<AIModels> => new Set([AIModels.OPENAI_5_6_SOL]);

// Common configs - these are good defaults
const COMMON_AGENT_CONFIGS = {
} as const;

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
    conversationalResponse: {
        name: PRIMARY_AGENT_MODEL,
        reasoning_effort: 'xhigh',
        max_tokens: 4000,
        temperature: 1,
        fallbackModel: FALLBACK_AGENT_MODEL,
    },
};

//======================================================================================
// Default config: GPT-5.6 Sol-based for all tasks via the OpenAI-compatible LLM proxy
//======================================================================================
const DEFAULT_AGENT_CONFIG: AgentConfig = {
    ...COMMON_AGENT_CONFIGS,
    conversationalResponse: {
        name: PRIMARY_AGENT_MODEL,
        reasoning_effort: 'xhigh',
        max_tokens: 4000,
        temperature: 0,
        fallbackModel: FALLBACK_AGENT_MODEL,
    },
};

export const AGENT_CONFIG: AgentConfig = env.PLATFORM_MODEL_PROVIDERS 
    ? PLATFORM_AGENT_CONFIG 
    : DEFAULT_AGENT_CONFIG;


export const AGENT_CONSTRAINTS: Map<AgentActionKey, AgentConstraintConfig> = new Map([
	['conversationalResponse', {
		allowedModels: gpt56SolOnly(),
		enabled: true,
	}],
]);
