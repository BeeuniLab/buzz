import { createObjectLogger } from '../../logger';
import type { DORateLimitStore, TaskSlotResult } from '../rate-limit/DORateLimitStore';

export const USER_TASK_CONCURRENCY_LIMIT = 1;
const USER_TASK_LEASE_TTL_MS = 45 * 60 * 1000;
const STORE_PREFIX = 'user-task-concurrency';

export const USER_TASK_CONCURRENCY_LIMIT_MESSAGE =
    'You already have a task running. Please wait for it to finish before starting another.';

export class UserTaskConcurrencyLimitError extends Error {
    constructor(public readonly result: TaskSlotResult) {
        super(USER_TASK_CONCURRENCY_LIMIT_MESSAGE);
        this.name = 'UserTaskConcurrencyLimitError';
    }
}

export type UserTaskKind =
    | 'create_project'
    | 'generate_all'
    | 'resume_generation'
    | 'user_input'
    | 'deploy_project'
    | 'deploy_preview';

export class UserTaskConcurrencyService {
    private static logger = createObjectLogger(this, 'UserTaskConcurrencyService');

    private static getStore(env: Env, userId: string): DurableObjectStub<DORateLimitStore> {
        return env.DORateLimitStore.getByName(`${STORE_PREFIX}:${userId}`) as DurableObjectStub<DORateLimitStore>;
    }

    static async acquire(
        env: Env,
        args: {
            userId: string;
            taskId: string;
            agentId?: string;
            kind?: UserTaskKind;
        },
    ): Promise<TaskSlotResult> {
        try {
            const result = await this.getStore(env, args.userId).acquireTaskSlot(
                args.taskId,
                {
                    userId: args.userId,
                    agentId: args.agentId,
                    kind: args.kind,
                },
                USER_TASK_CONCURRENCY_LIMIT,
                USER_TASK_LEASE_TTL_MS,
            );

            if (!result.success) {
                throw new UserTaskConcurrencyLimitError(result);
            }

            return result;
        } catch (error) {
            if (error instanceof UserTaskConcurrencyLimitError) {
                throw error;
            }

            this.logger.error('Failed to acquire user task slot; allowing task to start', {
                userId: args.userId,
                taskId: args.taskId,
                kind: args.kind,
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                success: true,
                activeCount: 0,
                limit: USER_TASK_CONCURRENCY_LIMIT,
                tasks: [],
            };
        }
    }

    static async touch(env: Env, userId: string | undefined, taskId: string | undefined): Promise<void> {
        if (!userId || !taskId) return;

        try {
            await this.getStore(env, userId).touchTaskSlot(taskId, USER_TASK_LEASE_TTL_MS, USER_TASK_CONCURRENCY_LIMIT);
        } catch (error) {
            this.logger.warn('Failed to refresh user task slot', {
                userId,
                taskId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    static async release(env: Env, userId: string | undefined, taskId: string | undefined): Promise<void> {
        if (!userId || !taskId) return;

        try {
            await this.getStore(env, userId).releaseTaskSlot(taskId, USER_TASK_CONCURRENCY_LIMIT);
        } catch (error) {
            this.logger.warn('Failed to release user task slot', {
                userId,
                taskId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
}
