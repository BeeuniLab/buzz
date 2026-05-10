import { createObjectLogger } from '../../logger';
import type { ActiveTaskLease, DORateLimitStore, TaskSlotResult } from '../rate-limit/DORateLimitStore';

export const USER_ACTIVE_PREVIEW_LIMIT = 1;
const USER_ACTIVE_PREVIEW_LEASE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STORE_PREFIX = 'user-active-previews';

export interface ActivePreviewReservation {
    result: TaskSlotResult;
    evictionCandidates: ActiveTaskLease[];
    releasesNeeded: number;
}

export class UserActivePreviewService {
    private static logger = createObjectLogger(this, 'UserActivePreviewService');

    private static getStore(env: Env, userId: string): DurableObjectStub<DORateLimitStore> {
        return env.DORateLimitStore.getByName(`${STORE_PREFIX}:${userId}`) as DurableObjectStub<DORateLimitStore>;
    }

    static async reserve(
        env: Env,
        args: {
            userId: string;
            agentId: string;
        },
    ): Promise<ActivePreviewReservation> {
        const store = this.getStore(env, args.userId);
        const previewLease = {
            userId: args.userId,
            agentId: args.agentId,
            kind: 'preview',
        };

        const result = await store.upsertTaskSlot(
            args.agentId,
            previewLease,
            USER_ACTIVE_PREVIEW_LIMIT,
            USER_ACTIVE_PREVIEW_LEASE_TTL_MS,
        );

        const releasesNeeded = Math.max(0, result.activeCount - USER_ACTIVE_PREVIEW_LIMIT);
        if (releasesNeeded === 0) {
            return { result, evictionCandidates: [], releasesNeeded };
        }

        const evictionCandidates = result.tasks
            .filter(task => (task.agentId ?? task.taskId) !== args.agentId)
            .sort((a, b) => a.updatedAt - b.updatedAt);

        this.logger.info('Active preview limit exceeded; eviction candidates selected', {
            userId: args.userId,
            agentId: args.agentId,
            activeCount: result.activeCount,
            limit: result.limit,
            releasesNeeded,
            candidates: evictionCandidates.map(task => task.agentId ?? task.taskId),
        });

        return { result, evictionCandidates, releasesNeeded };
    }

    static async release(env: Env, userId: string | undefined, agentId: string | undefined): Promise<void> {
        if (!userId || !agentId) return;

        try {
            await this.getStore(env, userId).releaseTaskSlot(agentId, USER_ACTIVE_PREVIEW_LIMIT);
        } catch (error) {
            this.logger.warn('Failed to release active preview slot', {
                userId,
                agentId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
}
