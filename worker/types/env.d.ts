declare namespace Cloudflare {
    interface Env {
        TEMPLATES_REPOSITORY: string;
        ALLOWED_EMAIL: string;
        ANTHROPIC_API_KEY: string;
        OPENAI_API_KEY: string;
        GOOGLE_AI_STUDIO_API_KEY: string;
        OPENROUTER_API_KEY: string;
        CEREBRAS_API_KEY: string;
        GROQ_API_KEY: string;
        GOOGLE_VERTEX_AI_API_KEY: string;
        PLATFORM_MODEL_PROVIDERS: string;
        LLM_PROXY_URL: string;
        LLM_PROXY_FALLBACK_URL: string;
        CLOUDFLARE_AI_GATEWAY_URL: string;
        CLOUDFLARE_AI_GATEWAY_TOKEN: string;
        SERPAPI_KEY: string;
        AI_PROXY_JWT_SECRET: string;
        ENTROPY_KEY: string;
        CUSTOM_PREVIEW_DOMAIN: string;
        ALLOCATION_STRATEGY: string;
        CF_ACCESS_ID: string;
        CF_ACCESS_SECRET: string;
        SENTRY_DSN: string;
        USE_TUNNEL_FOR_PREVIEW: string;
        USE_CLOUDFLARE_IMAGES: string;
        LLM_PROXY_API_KEY: string;
        LLM_PROXY_FALLBACK_API_KEY: string;
        SANDBOX_SERVICE_TYPE: string;
        SANDBOX_SERVICE_URL: string;
        SANDBOX_SERVICE_API_KEY: string;
    }
}
