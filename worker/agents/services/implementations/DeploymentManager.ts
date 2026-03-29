import { IDeploymentManager } from '../interfaces/IDeploymentManager';
import { generateId } from '../../../utils/idGenerator';
import { BaseAgentService } from './BaseAgentService';
import { ServiceOptions } from '../interfaces/IServiceOptions';
import { BaseProjectState } from '../../core/state';

/**
 * Manages deployment operations (browser-only mode)
 * Handles sessionId lifecycle
 */
export class DeploymentManager extends BaseAgentService<BaseProjectState> implements IDeploymentManager {

    constructor(
        options: ServiceOptions<BaseProjectState>,
    ) {
        super(options);

        // Ensure state has sessionId
        const state = this.getState();
        if (!state.sessionId) {
            this.setState({
                ...state,
                sessionId: DeploymentManager.generateNewSessionId()
            });
        }
    }

    /**
     * Get current session ID from state
     */
    getSessionId(): string {
        return this.getState().sessionId;
    }

    static generateNewSessionId(): string {
        return generateId();
    }
}
