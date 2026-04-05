# Buzz

> AI-powered interactive creative content platform — generate games, visual stories, interactive art, and rich visual experiences through natural conversation.

## What is Buzz

Buzz is a platform for creating interactive mini apps and creative content powered by AI. Users describe what they want in natural language, and the AI generates fully functional HTML canvas experiences — games, data visualizations, animated art, interactive stories, quizzes, and more.

Every project runs as a self-contained single-page experience in a portrait canvas (720x1280), with built-in host APIs for persistence, leaderboards, and asset management.

### Key Features

- **AI Content Generation** — Describe your idea, get a working interactive experience
- **Live Preview** — Instant browser-mode preview with real-time updates
- **Interactive Chat** — Iterate on your creation through conversation
- **Rich Host API** — `window.lib` provides save/load, leaderboards, asset helpers out of the box
- **One-Click Deploy** — Publish directly from the editor
- **GitHub Export** — Push your code to a repository

### Tech Stack

- **Frontend**: React 19, TypeScript, Vite, TailwindCSS
- **Backend**: Workers, Durable Objects, D1 (SQLite)
- **AI**: Multiple LLM providers (Gemini, OpenAI, Anthropic) via AI Gateway
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
| `GOOGLE_AI_STUDIO_API_KEY` | Google Gemini API key ([ai.google.dev](https://ai.google.dev)) |
| `JWT_SECRET` | Random string for session management |
| `SECRETS_ENCRYPTION_KEY` | Encryption key for user secrets |
| `CUSTOM_DOMAIN` | Your main domain (e.g. `buzzplay.app`) |
| `CUSTOM_PREVIEW_DOMAIN` | Preview subdomain parent (e.g. `preview.buzzplay.app`) |

### Optional Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `ALLOWED_EMAIL` | Restrict access to specific email |

### Domain & DNS Setup

Preview URLs use the pattern `b-{agentId}-{token}.{CUSTOM_PREVIEW_DOMAIN}`. Configure DNS:

1. Main domain: `CUSTOM_DOMAIN` CNAME pointing to your Worker
2. Preview wildcard: `*.{CUSTOM_PREVIEW_DOMAIN}` CNAME pointing to the same origin, proxied

Example for `buzzplay.app`:
```
buzzplay.app        → CNAME → your-worker.workers.dev  (proxied)
*.preview.buzzplay.app → CNAME → buzzplay.app     (proxied)
```

Set in environment:
```bash
CUSTOM_DOMAIN="buzzplay.app"
CUSTOM_PREVIEW_DOMAIN="preview.buzzplay.app"
```

### OAuth Setup (Optional)

**Google OAuth:**
1. [Google Cloud Console](https://console.cloud.google.com) → Create OAuth 2.0 Client ID
2. Authorized origins: `https://your-domain`
3. Redirect URI: `https://your-domain/api/auth/callback/google`
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

**GitHub OAuth:**
1. GitHub → Settings → Developer settings → OAuth Apps → New
2. Callback URL: `https://your-domain/api/auth/callback/github`
3. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`

**GitHub Export OAuth:**
1. Create a separate OAuth app for code export
2. Callback URL: `https://your-domain/api/github-exporter/callback`
3. Set `GITHUB_EXPORTER_CLIENT_ID` and `GITHUB_EXPORTER_CLIENT_SECRET`

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
LOCAL_R2=true bash deploy_templates.sh   # Local R2
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
