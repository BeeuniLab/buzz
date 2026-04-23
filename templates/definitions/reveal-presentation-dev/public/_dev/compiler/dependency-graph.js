/**
 * Dependency graph builder for parallel module loading
 * Tracks module dependencies and provides topological sorting
 */

export class DependencyGraph {
  constructor() {
    this.nodes = new Map() // url → { dependencies: Set<string>, dependents: Set<string> }
  }

  addNode(url, dependencies = []) {
    if (!this.nodes.has(url)) {
      this.nodes.set(url, {
        dependencies: new Set(),
        dependents: new Set(),
      })
    }

    const node = this.nodes.get(url)

    for (const dep of dependencies) {
      node.dependencies.add(dep)

      if (!this.nodes.has(dep)) {
        this.nodes.set(dep, {
          dependencies: new Set(),
          dependents: new Set(),
        })
      }

      this.nodes.get(dep).dependents.add(url)
    }
  }

  getDependencies(url) {
    return Array.from(this.nodes.get(url)?.dependencies || [])
  }

  getDependents(url) {
    return Array.from(this.nodes.get(url)?.dependents || [])
  }

  getAllNodes() {
    return Array.from(this.nodes.keys())
  }

  /**
   * Topological sort for dependency-order evaluation
   * Returns modules in order where dependencies come before dependents
   */
  topologicalSort() {
    const sorted = []
    const visited = new Set()
    const visiting = new Set()

    const visit = (url) => {
      if (visited.has(url)) return
      if (visiting.has(url)) {
        throw new Error(`Circular dependency detected: ${url}`)
      }

      visiting.add(url)

      const node = this.nodes.get(url)
      if (node) {
        for (const dep of node.dependencies) {
          visit(dep)
        }
      }

      visiting.delete(url)
      visited.add(url)
      sorted.push(url)
    }

    for (const url of this.nodes.keys()) {
      visit(url)
    }

    return sorted
  }

  /**
   * Detect circular dependencies
   * Returns array of cycles found
   */
  detectCycles() {
    const cycles = []
    const visited = new Set()
    const stack = new Set()

    const visit = (url, path = []) => {
      if (stack.has(url)) {
        const cycleStart = path.indexOf(url)
        cycles.push([...path.slice(cycleStart), url])
        return
      }

      if (visited.has(url)) return

      visited.add(url)
      stack.add(url)

      const node = this.nodes.get(url)
      if (node) {
        for (const dep of node.dependencies) {
          visit(dep, [...path, url])
        }
      }

      stack.delete(url)
    }

    for (const url of this.nodes.keys()) {
      visit(url)
    }

    return cycles
  }
}
