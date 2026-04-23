/**
 * Multi-tier caching system for runtime module loader
 * Provides source cache, transform cache, and blob cache
 */

class CacheLayer {
  constructor(name) {
    this.name = name
    this.data = new Map()
  }

  get(key) {
    return this.data.get(key)
  }

  set(key, value) {
    this.data.set(key, value)
  }

  has(key) {
    return this.data.has(key)
  }

  delete(key) {
    this.data.delete(key)
  }

  clear() {
    this.data.clear()
  }

  size() {
    return this.data.size
  }

  keys() {
    return Array.from(this.data.keys())
  }
}

export class CacheManager {
  constructor() {
    // Tier 1: Raw source code cache (url → source string)
    this.sourceCache = new CacheLayer('source')

    // Tier 2: Transformed code cache (url → transformed string)
    this.transformCache = new CacheLayer('transform')

    // Tier 3: Blob URL cache (url → blob URL)
    this.blobCache = new CacheLayer('blob')

    // Tier 4: Asset cache (url → { type, url, element, cleanup })
    this.assetCache = new CacheLayer('asset')

    // Tier 5: Module exports cache (url → module object)
    this.moduleCache = new CacheLayer('module')
  }

  /**
   * Invalidate a module and all its dependents
   */
  invalidateModule(url, dependencyGraph = null) {
    // Delete from all caches
    this.sourceCache.delete(url)
    this.transformCache.delete(url)

    // Cleanup blob URL if exists
    const blobUrl = this.blobCache.get(url)
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl)
      this.blobCache.delete(url)
    }

    // Cleanup asset if exists
    const asset = this.assetCache.get(url)
    if (asset?.cleanup) {
      asset.cleanup()
      this.assetCache.delete(url)
    }

    this.moduleCache.delete(url)

    // Recursively invalidate dependents
    if (dependencyGraph) {
      const dependents = dependencyGraph.getDependents(url)
      for (const dependent of dependents) {
        this.invalidateModule(dependent, dependencyGraph)
      }
    }
  }

  /**
   * Clear all caches
   */
  clearAll() {
    // Cleanup all blob URLs
    for (const blobUrl of this.blobCache.keys()) {
      URL.revokeObjectURL(this.blobCache.get(blobUrl))
    }

    // Cleanup all assets
    for (const url of this.assetCache.keys()) {
      const asset = this.assetCache.get(url)
      if (asset?.cleanup) {
        asset.cleanup()
      }
    }

    this.sourceCache.clear()
    this.transformCache.clear()
    this.blobCache.clear()
    this.assetCache.clear()
    this.moduleCache.clear()
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      source: this.sourceCache.size(),
      transform: this.transformCache.size(),
      blob: this.blobCache.size(),
      asset: this.assetCache.size(),
      module: this.moduleCache.size(),
    }
  }
}

// Global singleton cache manager
export const cacheManager = new CacheManager()
