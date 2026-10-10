# Buzz 

> AI-powered interactive creative content platform — generate games, visual stories, interactive art, and rich visual experiences through natural conversation.

## What is Buzz

Buzz is a platform for creating interactive mini apps and creative content powered by AI. Users describe what they want in natural language, and the AI generates fully functional HTML canvas experiences — games, data visualizations, animated art, interactive stories, quizzes, and more.

Every project runs as a self-contained single-page experience in a portrait (9:16) or landscape (16:9) canvas, with built-in host APIs for persistence, leaderboards, and asset management.

### Key Features

- **AI Content Generation** — Describe your idea, get a working interactive experience
- **Live Preview** — Instant browser-mode preview with real-time updates
- **Interactive Chat** — Iterate on your creation through conversation
- **Rich Host API** — `window.lib` provides save/load, leaderboards, asset helpers out of the box
- **One-Click Deploy** — Publish directly from the editor

### Tech Stack

- **Frontend**: React 19, TypeScript, Vite, TailwindCSS
- **Backend**: Workers, Durable Objects, D1 (SQLite)
- **AI**: GPT-5.6 Sol via OpenAI-compatible proxy, with optional BYOK/provider integrations
- **Storage**: R2 for templates, KV for sessions
- **Preview**: Browser-mode static file serving via Worker subdomains

## Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) v20+ (or [Bun](https://bun.sh/))
- A Cloudflare account with API token and Account ID
- At least one LLM API key (e.g. Google AI Studio)

### 1. Install Dependencies

```bash
bun install
# or
npm install
```

### 2. Configure Environment Variables

Create a `.dev.vars` file with your secrets (see project documentation for required variables).

### 3. Database Migrations

Apply all D1 migrations to your local database:

```bash
bun run db:migrate:local
```

This runs all SQL files in `migrations/` against the local D1 instance.

### 4. Deploy Templates to Local R2

Templates provide the scaffolding for generated projects:

```bash
cd templates
LOCAL_R2=true bash deploy_templates.sh
cd ..
```

### 5. Generate Invite Codes (if enabled)

If `INVITE_CODE_REQUIRED` is set to `"true"` in `wrangler.jsonc`, users need an invite code to create apps:

```bash
# Generate 5 codes for local dev
node scripts/generate-invite-codes.js 5

# With a custom prefix
node scripts/generate-invite-codes.js 5 --prefix BUZZ
```

### 6. Start Development Server

```bash
bun run dev
```

Visit `http://localhost:5173`. The Vite dev server handles the frontend, and Wrangler runs the Worker backend locally.

### Common Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Start local dev server (frontend + worker) |
| `bun run build` | Type check + Vite production build |
| `bun run typecheck` | Type check only (`tsc --noEmit`) |
| `bun run test` | Run tests with Vitest |
| `bun run test:watch` | Run tests in watch mode |
| `bun run db:migrate:local` | Apply D1 migrations locally |
| `bun run db:migrate:remote` | Apply D1 migrations to production |
| `bun run db:studio` | Open Drizzle Studio for local DB |
| `bun run db:studio:remote` | Open Drizzle Studio for production DB |
| `bun run cf-typegen` | Regenerate `worker-configuration.d.ts` from wrangler config |
| `bun run lint` | Run ESLint |

## Configuration

### Required Environment Variables

Set these in `.dev.vars` (local) or `.prod.vars` (production):

| Variable | Description |
|----------|-------------|
| `LLM_PROXY_API_KEY` | API key for the OpenAI-compatible GPT-5.6 Sol proxy |
| `LLM_PROXY_URL` | OpenAI-compatible proxy base URL, defaults to `https://subapi.cygnus.ink/v1` |
| `LLM_PROXY_FALLBACK_API_KEY` | Optional API key for the fallback OpenAI-compatible GPT-5.6 Sol proxy |
| `LLM_PROXY_FALLBACK_URL` | Optional fallback GPT-5.6 Sol proxy base URL, used on retry if the primary proxy fails |
| `IMAGE_URL` | OpenAI-compatible image generation base URL for generated project covers |
| `IMAGE_API_KEY` | API key for the image generation endpoint |
| `JWT_SECRET` | Random string for session management |
| `SECRETS_ENCRYPTION_KEY` | Encryption key for user secrets |
| `CUSTOM_DOMAIN` | Your main domain (e.g. `buzzplay.app`) |
| `CUSTOM_PREVIEW_DOMAIN` | Preview subdomain parent (e.g. `buzzplay.app`) |
| `CUSTOM_PUBLISHED_DOMAIN` | Published project subdomain parent (e.g. `buzzplay.app`) |

### Optional Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `ALLOWED_EMAIL` | Restrict access to specific email |
| `CODE_GENERATION_BACKEND` | Set to `codex` to run create-project generation through background `codex exec`; defaults to `native` |
| `CODEX_OPENAI_API_KEY` | Optional Codex-specific OpenAI API key; falls back to `OPENAI_API_KEY` or the LLM proxy keys |
| `CODEX_OPENAI_BASE_URL` | Optional OpenAI-compatible base URL for Codex CLI |
| `CODEX_MODEL` | Optional model override passed to `codex exec --model` |
| `CODEX_MODEL_PROVIDER` | Optional Codex provider name written to local `CODEX_HOME/config.toml`; defaults to `crs` |
| `CODEX_MODEL_REASONING_EFFORT` | Optional reasoning effort written to local Codex config |
| `CODEX_EXEC_TIMEOUT_MS` | Optional Codex command timeout; defaults to 1 hour |
| `CODEX_PROXY_ATTEMPTS` | Optional retry attempts per configured LLM proxy before switching to the fallback proxy; defaults to 3 |
| `CODEX_STATE_R2_BUCKET_NAME` | Optional R2 bucket name for persisted Codex sessions |
| `CODEX_STATE_R2_ACCESS_KEY_ID` | Optional R2 S3 API access key for Codex session persistence |
| `CODEX_STATE_R2_SECRET_ACCESS_KEY` | Optional R2 S3 API secret key for Codex session persistence |
| `CODEX_STATE_R2_ENDPOINT` | Optional R2/S3 endpoint; defaults to `https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `CODEX_STATE_R2_PREFIX` | Optional object prefix for persisted Codex sessions; defaults to `codex-state` |

### Domain & DNS Setup

Preview URLs use the pattern `b-{agentId}-{token}.{CUSTOM_PREVIEW_DOMAIN}`. Configure DNS:

1. Main domain: `CUSTOM_DOMAIN` CNAME pointing to your Worker
2. Preview wildcard: `*.{CUSTOM_PREVIEW_DOMAIN}` CNAME pointing to the same origin, proxied

Example for `buzzplay.app`:
```
buzzplay.app        → CNAME → your-worker.workers.dev  (proxied)
*.buzzplay.app      → CNAME → buzzplay.app             (proxied)
```

Set in environment:
```bash
CUSTOM_DOMAIN="buzzplay.app"
CUSTOM_PREVIEW_DOMAIN="buzzplay.app"
```

### Clerk Auth Setup (Optional)

Clerk handles user sign-in. Enable Google in the Clerk dashboard, then set:

```bash
VITE_CLERK_PUBLISHABLE_KEY="..."
CLERK_SECRET_KEY="..."
CLERK_JWT_ISSUER="..."
CLERK_JWKS_URL="..."
```

### KLIPY Media Picker (Optional)

The create composer can show a KLIPY media picker for GIFs, stickers, clips, static memes, and AI emojis. Create a KLIPY API key, then set:

```bash
VITE_KLIPY_API_KEY="..."
```

## Deployment

```bash
# Apply database migrations to production
bun run db:migrate:remote

# Deploy templates to remote R2
cd templates && bash deploy_templates.sh && cd ..

# Generate production invite codes (if needed)
node scripts/generate-invite-codes.js 10 --remote --prefix BUZZ

# Deploy worker + frontend
bun run deploy
```

Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` environment variables.

### Template Deployment

Templates are managed separately in `templates/`:

```bash
cd templates
bash deploy_templates.sh                  # Remote R2
```

## SDK

Programmatic access via the TypeScript SDK:

```bash
npm install @cf-vibesdk/sdk
```

```ts
import { PhasicClient } from '@cf-vibesdk/sdk';

const client = new PhasicClient({
  baseUrl: 'https://your-domain',
  apiKey: process.env.BUZZ_API_KEY!,
});

const session = await client.build('Create an interactive quiz about space', {
  projectType: 'app',
  autoGenerate: true,
});

await session.wait.deployable();
console.log('Preview URL:', session.state.previewUrl);
session.close();
```

See [SDK Documentation](sdk/README.md) for full API reference.
