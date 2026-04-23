/**
 * Fast import scanner using optimized regex
 * Extracts import specifiers from JavaScript/JSX source code
 */

/**
 * Scan source code for all import specifiers
 * Returns array of import specifiers (not resolved URLs yet)
 */
export function scanImports(source) {
  const imports = new Set()

  // Remove comments to avoid false positives
  const cleaned = removeComments(source)

  // Comprehensive import patterns
  const patterns = [
    // import ... from 'spec' or import 'spec'
    /import\s+(?:[\w*{}\s,]+\s+from\s+)?["']([^"']+)["']/g,
    // import('spec') - dynamic imports
    /import\s*\(["']([^"']+)["']\)/g,
    // export ... from 'spec'
    /export\s+(?:[\w*{}\s,]+\s+from\s+)?["']([^"']+)["']/g,
    // require('spec') - CommonJS
    /require\s*\(["']([^"']+)["']\)/g,
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(cleaned)) !== null) {
      const specifier = match[1]
      if (specifier) {
        imports.add(specifier)
      }
    }
  }

  return Array.from(imports)
}

/**
 * Remove comments from source code to avoid false positives in import detection
 */
function removeComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '') // Block comments
    .replace(/\/\/.*/g, '') // Line comments
}

/**
 * Resolve import specifier to absolute URL
 * Handles relative imports (./, ../) and bare imports (react, etc.)
 */
export function resolveImport(specifier, baseUrl) {
  // Bare imports (handled by import maps) - return as-is
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    return specifier
  }

  // Relative or absolute imports - resolve to full URL
  const base = new URL(baseUrl, location.origin)
  const resolved = new URL(specifier, base).href

  return resolved
}

/**
 * Check if URL has a file extension
 */
export function hasExtension(url) {
  const path = new URL(url, location.origin).pathname
  const lastSegment = path.split('/').pop() || ''
  return /\.[^.]+$/.test(lastSegment)
}

/**
 * Try to resolve import with automatic extension resolution
 * Tries: original, .jsx, .js, .tsx, .ts in order
 */
export async function resolveWithExtension(url) {
  // If already has extension, return as-is
  if (hasExtension(url)) {
    return url
  }

  // Try extensions in order
  const extensionsToTry = ['.jsx', '.js', '.tsx', '.ts']

  for (const ext of extensionsToTry) {
    const tryUrl = url + ext

    try {
      // Use GET instead of HEAD (more reliable with Cloudflare Workers)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2000) // 2 second timeout

      const res = await fetch(tryUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (res.ok) {
        // Check it's not HTML (SPA fallback)
        const contentType = res.headers.get('content-type') || ''
        if (!contentType.includes('text/html')) {
          return tryUrl
        }
      }
    } catch {
      continue
    }
  }

  // If all fail, assume .js (most common for library files)
  console.warn(`[Import Scanner] Could not resolve extension for ${url}, assuming .js`)
  return url + '.js'
}
