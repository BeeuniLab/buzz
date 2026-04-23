# Minimal Vite Technical Reference

## Quick Start

```bash
bun install
bun run dev      # Development server on port 3000
bun run build    # Production build
bun run lint     # Run ESLint
bun run deploy   # Deploy to Cloudflare Workers
```

## Project Structure

### Frontend (`/src`)

**main.tsx** - Entry point that renders the React application
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

**App.tsx** - Root component (replace with your application)
```tsx
import { useState } from 'react'

function App() {
  // Your application code here
  return <div>Your app</div>
}

export default App
```

**index.css** - Tailwind CSS imports
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Backend (`/worker`)

**index.ts** - Cloudflare Worker with Hono API framework

```typescript
import { Hono } from 'hono';

const app = new Hono();

app.get('/api/health', (c) => c.json({
  success: true,
  data: { status: 'healthy', timestamp: new Date().toISOString() }
}));

export default { fetch: app.fetch };
```

**Key features:**
- CORS enabled for `/api/*` routes
- Logger middleware for request logging
- Health check endpoint at `/api/health`
- Error handling (404 and 500)

## Adding Features

### Adding a New API Route

```typescript
// In worker/index.ts
app.get('/api/users', (c) => {
  return c.json({ success: true, data: [] })
})

app.post('/api/users', async (c) => {
  const body = await c.req.json()
  return c.json({ success: true, data: body })
})
```

### Adding State Management

Install your preferred library:
```bash
bun add zustand          # For Zustand
bun add @tanstack/react-query  # For React Query
```

### Adding Routing

Install React Router:
```bash
bun add react-router-dom
```

Update `main.tsx`:
```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom'

const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/about', element: <AboutPage /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
```

### Adding UI Components

Install your preferred UI library:
```bash
bun add @radix-ui/react-dialog  # For Radix UI primitives
bun add lucide-react            # For icons
```

Or use shadcn/ui:
```bash
bunx shadcn@latest init
bunx shadcn@latest add button
```

## Configuration Files

### vite.config.ts (Inherited from reference)

Configures Vite with:
- React plugin for Fast Refresh
- Cloudflare Workers plugin for edge deployment
- Path aliases (`@/` → `src/`)
- Worker configuration

### wrangler.jsonc

```jsonc
{
  "name": "minimal-vite",
  "main": "worker/index.ts",
  "compatibility_date": "2025-04-24",
  "assets": {
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  }
}
```

**Key settings:**
- `main` - Worker entry point
- `assets.run_worker_first` - Routes that hit the worker before serving static files
- `assets.not_found_handling` - Enables SPA routing (all 404s return index.html)

### tailwind.config.js (Inherited from reference)

Configured with:
- Content paths for `.tsx` and `.ts` files
- Default theme
- CSS variables for theming support

### tsconfig.json (Inherited from reference)

Configured with:
- Strict TypeScript checking
- Path aliases for clean imports
- React JSX support
- ES2022 target

## Development Workflow

### Local Development

```bash
bun run dev
```

Opens development server at `http://localhost:3000` with:
- Hot Module Replacement (HMR)
- Fast Refresh for React
- TypeScript type checking
- ESLint linting

### Building for Production

```bash
bun run build
```

Creates optimized production build:
- Frontend assets in `/dist` directory
- Worker code bundled with esbuild
- Assets minified and optimized
- Source maps generated

### Deploying to Cloudflare

```bash
bun run deploy
```

Deploys to Cloudflare Workers:
1. Builds production bundle
2. Uploads assets to Cloudflare
3. Deploys worker to edge network
4. Returns deployment URL

### Linting

```bash
bun run lint
```

Runs ESLint with:
- TypeScript support
- React hooks rules
- Import/export validation
- Auto-fix available with `--fix` flag

## Environment Variables

Create `.dev.vars` for local development:
```env
MY_API_KEY=abc123
DATABASE_URL=...
```

For production, use Wrangler secrets:
```bash
bunx wrangler secret put MY_API_KEY
```

Access in worker:
```typescript
type Env = {
  MY_API_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/api/data', (c) => {
  const apiKey = c.env.MY_API_KEY;
  // Use apiKey...
})
```

## Adding Cloudflare Bindings

### D1 Database

Update `wrangler.jsonc`:
```jsonc
{
  "d1_databases": [{
    "binding": "DB",
    "database_name": "my-database",
    "database_id": "..."
  }]
}
```

Usage in worker:
```typescript
type Env = {
  DB: D1Database;
}

app.get('/api/users', async (c) => {
  const users = await c.env.DB.prepare('SELECT * FROM users').all()
  return c.json(users)
})
```

### KV Storage

Update `wrangler.jsonc`:
```jsonc
{
  "kv_namespaces": [{
    "binding": "KV",
    "id": "..."
  }]
}
```

Usage in worker:
```typescript
type Env = {
  KV: KVNamespace;
}

app.get('/api/cache/:key', async (c) => {
  const value = await c.env.KV.get(c.req.param('key'))
  return c.json({ value })
})
```

### R2 Storage

Update `wrangler.jsonc`:
```jsonc
{
  "r2_buckets": [{
    "binding": "BUCKET",
    "bucket_name": "my-bucket"
  }]
}
```

Usage in worker:
```typescript
type Env = {
  BUCKET: R2Bucket;
}

app.post('/api/upload', async (c) => {
  const body = await c.req.arrayBuffer()
  await c.env.BUCKET.put('file.txt', body)
  return c.json({ success: true })
})
```

## Best Practices

### Code Organization

```
src/
├── components/     # Reusable React components
├── hooks/          # Custom React hooks
├── lib/            # Utility functions
├── types/          # TypeScript type definitions
├── pages/          # Page components (if using routing)
└── App.tsx         # Root component
```

### API Structure

```
worker/
├── index.ts        # Main entry point
├── routes/         # Route handlers
├── middleware/     # Custom middleware
├── utils/          # Helper functions
└── types.ts        # Type definitions
```

### Type Safety

Always define types for:
- API request/response bodies
- Environment variables
- Component props
- Function parameters

```typescript
type User = {
  id: string;
  name: string;
  email: string;
}

app.get('/api/users', (c) => {
  const users: User[] = []
  return c.json({ success: true, data: users })
})
```

### Error Handling

```typescript
app.get('/api/users/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const user = await getUser(id)

    if (!user) {
      return c.json({ success: false, error: 'User not found' }, 404)
    }

    return c.json({ success: true, data: user })
  } catch (error) {
    console.error('Error fetching user:', error)
    return c.json({ success: false, error: 'Internal error' }, 500)
  }
})
```

## Troubleshooting

### Port Already in Use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or use a different port
PORT=3001 bun run dev
```

### Type Errors

```bash
# Regenerate Cloudflare types
bun run cf-typegen

# Check TypeScript errors
bunx tsc --noEmit
```

### Build Errors

```bash
# Clear build cache
rm -rf dist .vite

# Clear node_modules and reinstall
rm -rf node_modules
bun install
```

### Deployment Errors

```bash
# Check wrangler authentication
bunx wrangler whoami

# Login if needed
bunx wrangler login

# View deployment logs
bunx wrangler tail
```

## Next Steps

This minimal template provides a clean foundation. Build your application by:

1. **Frontend**: Add components, hooks, and pages in `src/`
2. **Backend**: Add routes and logic in `worker/`
3. **Styling**: Use Tailwind utilities or add custom CSS
4. **Data**: Add Cloudflare bindings (D1, KV, R2) as needed
5. **Deploy**: Push to production with `bun run deploy`

Keep it simple and add only what you need!

---

## Routing (CRITICAL)

If you add React Router, use `createBrowserRouter` - do NOT use `BrowserRouter`/`HashRouter`.

If you switch routers, `useRouteError()` will not work (you'll get a router configuration error screen instead of proper route error handling).

**Add routes in `src/main.tsx`:**
```tsx
const router = createBrowserRouter([
  { path: "/", element: <HomePage /> },
  { path: "/new", element: <NewPage /> },
]);
```

**Navigation:** `import { Link } from 'react-router-dom'` then `<Link to="/new">New</Link>`

**Don't:**
- Use `BrowserRouter`, `HashRouter`, `MemoryRouter`
- Use `useRouteError()` in your components
