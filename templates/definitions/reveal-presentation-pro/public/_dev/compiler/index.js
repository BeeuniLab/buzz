/**
 * Runtime Module Loader - Blob URL Approach (Simple & Reliable)
 *
 * Architecture:
 * Phase 1: Build dependency graph (parallel)
 * Phase 2: Fetch and transform all modules → Create blob URLs (parallel)
 * Phase 3: Import from blob URLs
 */

import { DependencyGraph } from './dependency-graph.js'
import { resolveImport, resolveWithExtension } from './import-scanner.js'
import { cacheManager } from './cache.js'

// Debug logging - disabled in production
const DEBUG = false

function log(...args) {
  if (DEBUG) console.log(...args)
}

function warn(...args) {
  if (DEBUG) console.warn(...args)
}

// Blob URL cache: absolute URL → blob URL
const blobURLCache = new Map()
const graphCache = new Map()

/**
 * Main API: Load a module and all its dependencies
 * Returns the module's exports
 */
export async function loadModule(entryUrl) {
  log(`[Runtime Loader] Loading module: ${entryUrl}`)

  // Resolve entry URL to absolute
  const resolvedEntry = new URL(entryUrl, location.origin).href

  // Phase 1: Build complete dependency graph (parallel)
  log('[Runtime Loader] Phase 1: Building dependency graph...')
  const graph = await buildDependencyGraph(resolvedEntry)
  const allNodes = graph.getAllNodes()
  log(`[Runtime Loader] Graph built: ${allNodes.length} modules`)
  log('[Runtime Loader] All modules in graph:', allNodes)

  // Phase 2: Fetch and transform all modules (parallel)
  log('[Runtime Loader] Phase 2: Fetching and transforming modules...')
  await fetchAndTransformAll(graph)
  log('[Runtime Loader] All modules transformed')
  log(`[Runtime Loader] Blob URL cache size: ${blobURLCache.size}`)
  log('[Runtime Loader] Blob URL mappings:', Array.from(blobURLCache.entries()).map(([url, blob]) => ({ url, blob })))

  // Phase 3: Write to virtual FS and import
  log('[Runtime Loader] Phase 3: Writing to virtual FS and importing...')
  const module = await importModule(resolvedEntry, graph)
  log('[Runtime Loader] Module loaded successfully')

  return module
}

/**
 * Phase 1: Build dependency graph by scanning all imports in parallel
 * Uses Babel AST parser (production-grade, zero false positives)
 */
async function buildDependencyGraph(entryUrl) {
  const cacheKey = entryUrl
  if (graphCache.has(cacheKey)) {
    return graphCache.get(cacheKey)
  }
  
  const graph = new DependencyGraph()
  const pending = new Set([entryUrl])
  const processed = new Set()

  while (pending.size > 0) {
    // Process all pending modules in parallel
    const urls = Array.from(pending)
    pending.clear()

    const results = await Promise.all(
      urls.map(async (url) => {
        if (processed.has(url)) return null
        processed.add(url)

        try {
          // Fetch source (with caching)
          const source = await fetchSource(url)

          // Extract imports using Babel AST (no false positives from strings/templates)
          const importSpecs = extractImportsWithBabel(source)

          // Resolve import specifiers to URLs
          const deps = await Promise.all(
            importSpecs.map(async (spec) => {
              const resolved = resolveImport(spec, url)

              // Skip bare imports (handled by import maps)
              if (!resolved.startsWith('/') && !resolved.startsWith('http')) {
                return null
              }

              // Resolve extension if missing
              return await resolveWithExtension(resolved)
            })
          )

          // Filter out nulls (bare imports)
          const filteredDeps = deps.filter((d) => d !== null)

          return { url, deps: filteredDeps }
        } catch (error) {
          console.error(`Failed to process ${url}:`, error)
          return { url, deps: [] }
        }
      })
    )

    // Add to graph and queue new dependencies
    for (const result of results) {
      if (!result) continue

      graph.addNode(result.url, result.deps)

      for (const dep of result.deps) {
        if (!processed.has(dep)) {
          pending.add(dep)
        }
      }
    }
  }

  graphCache.set(cacheKey, graph)
  return graph
}

/**
 * Extract import specifiers using Babel AST parser
 * Production-grade approach - no regex, no false positives
 */
function extractImportsWithBabel(source) {
  const imports = []

  // Custom Babel plugin to extract imports via AST traversal
  const importExtractorPlugin = function() {
    return {
      visitor: {
        // Static imports: import X from 'spec'
        ImportDeclaration(path) {
          const spec = path.node.source.value
          imports.push(spec)
        },

        // Dynamic imports: import('spec')
        CallExpression(path) {
          if (path.node.callee.type === 'Import') {
            const arg = path.node.arguments[0]
            if (arg && arg.type === 'StringLiteral') {
              imports.push(arg.value)
            }
          }
        },

        // Export from: export { X } from 'spec'
        ExportNamedDeclaration(path) {
          if (path.node.source) {
            imports.push(path.node.source.value)
          }
        },

        // Export all: export * from 'spec'
        ExportAllDeclaration(path) {
          imports.push(path.node.source.value)
        }
      }
    }
  }

  try {
    // Transform just to parse - we only need the imports
    Babel.transform(source, {
      presets: [['react', { runtime: 'automatic' }]], // Required to parse JSX syntax
      plugins: [importExtractorPlugin],
      sourceType: 'module',
      code: false // Don't generate code, just parse
    })
  } catch (error) {
    warn(`[Babel Import Extractor] Failed to parse ${source.substring(0, 50)}...`, error)
  }

  return [...new Set(imports)] // Deduplicate
}

/**
 * Phase 2: Fetch and transform all modules → Create blob URLs
 * IMPORTANT: Process in topological order (dependencies first)
 */
async function fetchAndTransformAll(graph) {
  const urls = graph.getAllNodes()

  // Get topological order (dependencies first)
  const sortedURLs = graph.topologicalSort()

  // Process in order (dependencies first, so their blob URLs exist when needed)
  for (const url of sortedURLs) {
    try {
      // Skip if already transformed
      if (blobURLCache.has(url)) {
        continue
      }

      // Fetch source
      const source = await fetchSource(url)

      // Get dependencies for this module from the graph
      const dependencies = graph.getDependencies(url)

      // Transform using Babel AST with blob URL rewriting
      // At this point, all dependencies should have blob URLs (topological order)
      const transformedCode = transformWithBlobURLs(source, url, dependencies)

      // Create blob URL from transformed code
      const blob = new Blob([transformedCode], { type: 'application/javascript' })
      const blobURL = URL.createObjectURL(blob)

      // Cache blob URL
      blobURLCache.set(url, blobURL)

      log(`[Runtime Loader] Created blob for ${url}`)
    } catch (error) {
      console.error(`Failed to transform ${url}:`, error)
      const errorCode = `
        console.error('Module transformation error:', ${JSON.stringify({
          message: error.message,
          stack: error.stack,
          url: url
        })});
        throw new Error(${JSON.stringify(error.message)});
      `
      const blob = new Blob([errorCode], { type: 'application/javascript' })
      const blobURL = URL.createObjectURL(blob)
      blobURLCache.set(url, blobURL)
    }
  }
}

/**
 * Transform code and rewrite imports to use blob URLs
 * Single-pass: JSX transform + import rewriting using Babel plugin
 */
function transformWithBlobURLs(source, baseUrl, dependencies) {
  // Helper to resolve import spec to blob URL
  function resolveToBlobURL(spec) {
    // Bare imports (import maps) - keep as-is
    if (!spec.startsWith('.') && !spec.startsWith('/')) {
      return null
    }

    // Resolve spec to absolute URL
    const resolvedURL = resolveImport(spec, baseUrl)
    log(`[Blob URL Resolution] Attempting to resolve: "${spec}" → ${resolvedURL} (from ${baseUrl})`)

    // Find blob URL - try exact match first
    let blobURL = blobURLCache.get(resolvedURL)
    if (blobURL) {
      log(`[Blob URL Resolution] ✓ Found exact match: ${resolvedURL} → ${blobURL}`)
      return blobURL
    }

    // Try with .jsx extension only (standardized)
    if (!blobURL) {
      const withExt = resolvedURL + '.jsx'
      if (blobURLCache.has(withExt)) {
        blobURL = blobURLCache.get(withExt)
        log(`[Blob URL Resolution] ✓ Found with .jsx extension: ${withExt} → ${blobURL}`)
      }
    }

    // Search in dependencies as fallback
    if (!blobURL) {
      for (const dep of dependencies) {
        if (blobURLCache.has(dep) && (dep === resolvedURL || dep.startsWith(resolvedURL))) {
          blobURL = blobURLCache.get(dep)
          log(`[Blob URL Resolution] ✓ Found in dependencies: ${dep} → ${blobURL}`)
          break
        }
      }
    }

    if (!blobURL) {
      warn(`[Blob URL Resolution] ✗ Could not find blob URL for "${spec}" (resolved: ${resolvedURL})`)
      warn(`[Blob URL Resolution] Available dependencies for ${baseUrl}:`, dependencies)
      warn(`[Blob URL Resolution] Cache keys:`, Array.from(blobURLCache.keys()))
    }

    return blobURL
  }

  // Babel plugin to rewrite import paths to blob URLs
  const importRewriterPlugin = function() {
    return {
      visitor: {
        // Static imports: import X from 'spec'
        ImportDeclaration(path) {
          const spec = path.node.source.value
          const blobURL = resolveToBlobURL(spec)
          if (blobURL) {
            path.node.source.value = blobURL
          }
        },

        // Dynamic imports: import('spec')
        CallExpression(path) {
          if (path.node.callee.type === 'Import') {
            const arg = path.node.arguments[0]
            if (arg && arg.type === 'StringLiteral') {
              const spec = arg.value
              const blobURL = resolveToBlobURL(spec)
              if (blobURL) {
                arg.value = blobURL
              }
            }
          }
        },

        // Export from: export { X } from 'spec'
        ExportNamedDeclaration(path) {
          if (path.node.source) {
            const spec = path.node.source.value
            const blobURL = resolveToBlobURL(spec)
            if (blobURL) {
              path.node.source.value = blobURL
            }
          }
        },

        // Export all: export * from 'spec'
        ExportAllDeclaration(path) {
          const spec = path.node.source.value
          const blobURL = resolveToBlobURL(spec)
          if (blobURL) {
            path.node.source.value = blobURL
          }
        }
      }
    }
  }

  // Single-pass transform: JSX + import rewriting
  const result = Babel.transform(source, {
    presets: [
      ['react', {
        runtime: 'automatic',
        development: false
      }]
    ],
    plugins: [importRewriterPlugin],
    sourceType: 'module',
    filename: baseUrl
  })

  return result.code
}

/**
 * Phase 3: Import module from blob URL
 */
async function importModule(url, graph) {
  const blobURL = blobURLCache.get(url)

  if (!blobURL) {
    throw new Error(`No blob URL found for ${url}`)
  }

  try {
    // Import from blob URL
    const module = await import(blobURL)

    // Cache the module
    cacheManager.moduleCache.set(url, module)

    return module
  } catch (error) {
    console.error(`Failed to import ${url} from blob URL:`, error)
    throw new Error(`Failed to import module ${url}: ${error.message}`)
  }
}

/**
 * Fetch source code with caching
 */
async function fetchSource(url) {
  // Check cache first
  const cached = cacheManager.sourceCache.get(url)
  if (cached) return cached

  try {
    const res = await fetch(url, { cache: 'no-store' })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    }

    // Check for HTML (SPA fallback)
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('text/html')) {
      throw new Error(`Module returned HTML (SPA fallback). Check if file exists: ${url}`)
    }

    const source = await res.text()
    cacheManager.sourceCache.set(url, source)
    return source
  } catch (error) {
    throw new Error(`Failed to fetch ${url}: ${error.message}`)
  }
}

/**
 * Simple API compatible with old jsxImport
 */
export async function jsxImport(url) {
  const module = await loadModule(url)
  return module
}

/**
 * Load a single module on-demand (individual loading)
 * This is the main API for loading slides individually
 */
export async function loadSingleModule(url) {
  log(`[Runtime Loader] Loading single module: ${url}`)

  // Build graph for just this module and its dependencies
  const graph = await buildDependencyGraph(url)

  // Transform all dependencies
  await fetchAndTransformAll(graph)

  // Import the module
  return await importModule(url, graph)
}

/**
 * Cleanup function to revoke blob URLs and free memory
 * Call this when presentation is unmounted or refreshed
 */
export function cleanup() {
  log(`[Runtime Loader] Cleaning up ${blobURLCache.size} blob URLs`)

  for (const blobURL of blobURLCache.values()) {
    URL.revokeObjectURL(blobURL)
  }

  blobURLCache.clear()
  graphCache.clear()
  cacheManager.sourceCache.clear()
  cacheManager.moduleCache.clear()

  log('[Runtime Loader] Cleanup complete')
}

// Export utilities
export { cacheManager }
