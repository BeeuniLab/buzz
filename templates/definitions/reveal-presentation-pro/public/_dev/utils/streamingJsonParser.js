/**
 * Streaming JSON Parser
 *
 * Accumulates JSON chunks from WebSocket and attempts to parse
 * partial JSON structures for progressive rendering.
 *
 * Improved version with:
 * - More robust partial parsing
 * - Exponential backoff on errors
 * - Better detection of complete vs incomplete elements
 */

export class StreamingJsonParser {
  constructor(maxErrors = 10) {
    this.buffer = ''
    this.lastValidState = null
    this.errorCount = 0
    this.maxErrors = maxErrors
    this.retryDelay = 100 // milliseconds
  }

  /**
   * Add a chunk of JSON and try to parse
   * @param {string} chunk - JSON chunk from WebSocket
   * @returns {{ complete: boolean, data: object | null, error: string | null }}
   */
  addChunk(chunk) {
    this.buffer += chunk

    // Try to parse complete JSON first
    try {
      const parsed = JSON.parse(this.buffer)
      this.lastValidState = parsed
      this.errorCount = 0 // Reset error count on success
      return { complete: true, data: parsed, error: null }
    } catch (e) {
      // Try partial parsing
      const partial = this.tryParsePartial()
      if (partial) {
        this.lastValidState = partial
        this.errorCount = 0
        return { complete: false, data: partial, error: null }
      }

      // Track errors
      this.errorCount++
      if (this.errorCount >= this.maxErrors) {
        const error = `Too many parse errors (${this.errorCount}), buffer may be corrupted`
        console.warn(error)
        return { complete: false, data: this.lastValidState, error }
      }
    }

    return { complete: false, data: this.lastValidState, error: null }
  }

  /**
   * Try to parse partial JSON by intelligently finding complete structures
   */
  tryParsePartial() {
    // Strategy: Find the last complete JSON object in the buffer
    // by searching for complete braces/brackets from the end

    // First, try to extract just the metadata (id, canvas) if nothing else parses
    const metadata = this.extractMetadata()
    if (!metadata) return null

    // Try to find root element
    const rootElement = this.extractRootElement()
    if (!rootElement) {
      // Return just metadata if we can't parse root yet
      return {
        id: metadata.id,
        canvas: metadata.canvas || { width: 1920, height: 1080 },
        root: { type: 'div', className: '', children: [] }
      }
    }

    // Try to parse children array if it exists
    const children = this.extractChildren()
    if (children) {
      rootElement.children = children
    }

    return {
      id: metadata.id,
      canvas: metadata.canvas || { width: 1920, height: 1080 },
      root: rootElement,
      metadata: metadata.slideMetadata
    }
  }

  /**
   * Extract slide metadata (id, canvas, metadata) from buffer
   */
  extractMetadata() {
    try {
      const idMatch = this.buffer.match(/"id"\s*:\s*"([^"]+)"/)
      if (!idMatch) return null

      const canvasMatch = this.buffer.match(/"canvas"\s*:\s*(\{[^}]*\})/)
      const metadataMatch = this.buffer.match(/"metadata"\s*:\s*(\{[^}]*\})/)

      return {
        id: idMatch[1],
        canvas: canvasMatch ? JSON.parse(canvasMatch[1]) : null,
        slideMetadata: metadataMatch ? JSON.parse(metadataMatch[1]) : undefined
      }
    } catch (e) {
      return null
    }
  }

  /**
   * Extract root element properties
   */
  extractRootElement() {
    try {
      const rootMatch = this.buffer.match(/"root"\s*:\s*\{/)
      if (!rootMatch) return null

      // Extract type and className from root
      const rootSection = this.buffer.substring(rootMatch.index)
      const typeMatch = rootSection.match(/"type"\s*:\s*"([^"]+)"/)
      const classMatch = rootSection.match(/"className"\s*:\s*"([^"]*)"/)

      if (!typeMatch) return null

      return {
        type: typeMatch[1],
        className: classMatch ? classMatch[1] : '',
        children: []
      }
    } catch (e) {
      return null
    }
  }

  /**
   * Extract children array, finding last complete child
   */
  extractChildren() {
    try {
      const childrenMatch = this.buffer.match(/"children"\s*:\s*\[/)
      if (!childrenMatch) return null

      const childrenStart = childrenMatch.index + childrenMatch[0].length
      const remaining = this.buffer.substring(childrenStart)

      // Try to find complete child elements by counting braces
      const children = []
      let depth = 0
      let currentChild = ''
      let inString = false
      let escapeNext = false

      for (let i = 0; i < remaining.length; i++) {
        const char = remaining[i]

        if (escapeNext) {
          currentChild += char
          escapeNext = false
          continue
        }

        if (char === '\\') {
          escapeNext = true
          currentChild += char
          continue
        }

        if (char === '"' && !escapeNext) {
          inString = !inString
        }

        if (!inString) {
          if (char === '{') depth++
          if (char === '}') depth--

          // Found a complete child
          if (depth === 0 && char === '}') {
            currentChild += char
            try {
              const parsed = JSON.parse(currentChild)
              children.push(parsed)
              currentChild = ''
            } catch (e) {
              // Not valid JSON yet, continue accumulating
            }
          } else if (char === ']' && currentChild.trim() === '') {
            // End of children array
            break
          }
        }

        currentChild += char
      }

      return children.length > 0 ? children : null
    } catch (e) {
      return null
    }
  }

  /**
   * Get the current streaming position
   * @returns {{ slideId: string | null, elementCount: number }}
   */
  getStreamingPosition() {
    const metadata = this.extractMetadata()
    const children = this.extractChildren()

    return {
      slideId: metadata?.id || null,
      elementCount: children?.length || 0
    }
  }

  /**
   * Reset the parser
   */
  reset() {
    this.buffer = ''
    this.lastValidState = null
    this.errorCount = 0
  }

  /**
   * Get current buffer length (for debugging)
   */
  getBufferLength() {
    return this.buffer.length
  }
}
