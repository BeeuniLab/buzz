/**
 * Interface for deployment management (browser-only mode)
 * Manages sessionId lifecycle
 */
export interface IDeploymentManager {
    /**
     * Get current session ID
     */
    getSessionId(): string;
}
