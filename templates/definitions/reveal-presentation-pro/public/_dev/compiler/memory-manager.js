/**
 * Memory manager for tracking and cleaning up runtime resources
 * Manages blob URLs, style tags, and other DOM elements
 */

export class MemoryManager {
  constructor() {
    // Track all created blob URLs
    this.blobRegistry = new Map() // moduleUrl → blobUrl

    // Track all injected style elements
    this.styleRegistry = new Map() // moduleUrl → HTMLStyleElement

    // Track all created object URLs for assets
    this.assetRegistry = new Map() // moduleUrl → blobUrl

    // Setup cleanup on page unload
    this.setupUnloadHandler()
  }

  /**
   * Register a blob URL
   */
  registerBlob(moduleUrl, blobUrl) {
    // Revoke old blob if exists
    const oldBlob = this.blobRegistry.get(moduleUrl)
    if (oldBlob) {
      URL.revokeObjectURL(oldBlob)
    }

    this.blobRegistry.set(moduleUrl, blobUrl)
  }

  /**
   * Register a style element
   */
  registerStyle(moduleUrl, styleElement) {
    // Remove old style if exists
    const oldStyle = this.styleRegistry.get(moduleUrl)
    if (oldStyle && oldStyle.parentNode) {
      oldStyle.parentNode.removeChild(oldStyle)
    }

    this.styleRegistry.set(moduleUrl, styleElement)
  }

  /**
   * Register an asset blob URL
   */
  registerAsset(moduleUrl, blobUrl) {
    // Revoke old asset if exists
    const oldAsset = this.assetRegistry.get(moduleUrl)
    if (oldAsset) {
      URL.revokeObjectURL(oldAsset)
    }

    this.assetRegistry.set(moduleUrl, blobUrl)
  }

  /**
   * Cleanup a specific module's resources
   */
  cleanupModule(moduleUrl) {
    // Cleanup blob URL
    const blobUrl = this.blobRegistry.get(moduleUrl)
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl)
      this.blobRegistry.delete(moduleUrl)
    }

    // Cleanup style element
    const styleElement = this.styleRegistry.get(moduleUrl)
    if (styleElement && styleElement.parentNode) {
      styleElement.parentNode.removeChild(styleElement)
      this.styleRegistry.delete(moduleUrl)
    }

    // Cleanup asset
    const assetUrl = this.assetRegistry.get(moduleUrl)
    if (assetUrl) {
      URL.revokeObjectURL(assetUrl)
      this.assetRegistry.delete(moduleUrl)
    }
  }

  /**
   * Cleanup all resources
   */
  cleanupAll() {
    // Revoke all blob URLs
    for (const blobUrl of this.blobRegistry.values()) {
      URL.revokeObjectURL(blobUrl)
    }
    this.blobRegistry.clear()

    // Remove all style elements
    for (const styleElement of this.styleRegistry.values()) {
      if (styleElement.parentNode) {
        styleElement.parentNode.removeChild(styleElement)
      }
    }
    this.styleRegistry.clear()

    // Revoke all asset URLs
    for (const assetUrl of this.assetRegistry.values()) {
      URL.revokeObjectURL(assetUrl)
    }
    this.assetRegistry.clear()
  }

  /**
   * Setup handler to cleanup on page unload
   */
  setupUnloadHandler() {
    window.addEventListener('beforeunload', () => {
      this.cleanupAll()
    })
  }

  /**
   * Get memory usage statistics
   */
  getStats() {
    return {
      blobs: this.blobRegistry.size,
      styles: this.styleRegistry.size,
      assets: this.assetRegistry.size,
    }
  }
}

// Global singleton memory manager
export const memoryManager = new MemoryManager()
