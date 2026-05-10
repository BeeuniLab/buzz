import { createObjectLogger } from '../../logger';
import type { DORateLimitStore, TaskQueueSlotResult } from '../rate-limit/DORateLimitStore';

const STORE_NAME = 'global-sandbox-capacity';
const DEFAULT_GLOBAL_SANDBOX_LIMIT = 480;
const GLOBAL_SANDBOX_LEASE_TTL_MS = 8 * 60 * 1000;
const FOREGROUND_SANDBOX_LEASE_TTL_MS = 60 * 1000;
const FOREGROUND_SANDBOX_WAIT_TIMEOUT_MS = 90 * 1000;
const WAITING_LEASE_REFRESH_MS = 15_000;
const MAX_WAIT_JITTER_MS = 3_000;

export interface GlobalSandboxCapacityProgress {
    position: number;
}

export interface GlobalSandboxCapacityAcquireResult {
    result: TaskQueueSlotResult;
    waitedMs: number;
}

export class GlobalSandboxCapacityWaitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GlobalSandboxCapacityWaitError';
    }
}

export class GlobalSandboxCapacityTimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GlobalSandboxCapacityTimeoutError';
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getGlobalSandboxLimit(env: Env): number {
    const configuredLimit = Number(env.MAX_SANDBOX_INSTANCES);
    return Number.isFinite(configuredLimit) && configuredLimit > 0
        ? Math.floor(configuredLimit)
        : DEFAULT_GLOBAL_SANDBOX_LIMIT;
}

export class GlobalSandboxCapacityService {
    private static logger = createObjectLogger(this, 'GlobalSandboxCapacityService');

    private static getStore(env: Env): DurableObjectStub<DORateLimitStore> {
        return env.DORateLimitStore.getByName(STORE_NAME) as DurableObjectStub<DORateLimitStore>;
    }

    static async acquire(
        env: Env,
        args: {
            userId?: string;
            agentId: string;
            kind?: string;
            mode?: 'background' | 'foreground';
            onProgress?: (progress: GlobalSandboxCapacityProgress) => Promise<void>;
            shouldContinue?: () => boolean;
        },
    ): Promise<GlobalSandboxCapacityAcquireResult> {
        const limit = getGlobalSandboxLimit(env);
        const startedAt = Date.now();
        const mode = args.mode ?? 'background';
        const leaseTtlMs = mode === 'foreground'
            ? FOREGROUND_SANDBOX_LEASE_TTL_MS
            : GLOBAL_SANDBOX_LEASE_TTL_MS;
        let lastReportedPosition: number | undefined;

        while (true) {
            if (args.shouldContinue && !args.shouldContinue()) {
                await this.release(env, args.agentId);
                throw new GlobalSandboxCapacityWaitError('Sandbox queue wait was cancelled.');
            }
            if (mode === 'foreground' && Date.now() - startedAt >= FOREGROUND_SANDBOX_WAIT_TIMEOUT_MS) {
                await this.release(env, args.agentId);
                throw new GlobalSandboxCapacityTimeoutError('Preview is still waiting for an available workspace.');
            }

            const result = await this.getStore(env).acquireQueuedTaskSlot(
                args.agentId,
                {
                    userId: args.userId ?? 'anonymous',
                    agentId: args.agentId,
                    kind: args.kind ?? 'sandbox',
                },
                limit,
                leaseTtlMs,
            );

            if (result.success) {
                if (lastReportedPosition !== undefined) {
                    this.logger.info('Global sandbox capacity acquired after waiting', {
                        agentId: args.agentId,
                        kind: args.kind,
                        waitedMs: Date.now() - startedAt,
                    });
                }
                return { result, waitedMs: Date.now() - startedAt };
            }

            const position = result.position ?? Math.max(1, result.waitingCount);
            if (position !== lastReportedPosition) {
                lastReportedPosition = position;
                await args.onProgress?.({ position });
            }

            const jitter = Math.floor(Math.random() * MAX_WAIT_JITTER_MS);
            await sleep(WAITING_LEASE_REFRESH_MS + jitter);
        }
    }

    static async release(env: Env, agentId: string | undefined): Promise<void> {
        if (!agentId) return;

        try {
            await this.getStore(env).releaseQueuedTaskSlot(agentId, getGlobalSandboxLimit(env));
        } catch (error) {
            this.logger.warn('Failed to release global sandbox capacity slot', {
                agentId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    static async touch(env: Env, agentId: string | undefined): Promise<void> {
        if (!agentId) return;

        try {
            await this.getStore(env).touchTaskSlot(
                agentId,
                GLOBAL_SANDBOX_LEASE_TTL_MS,
                getGlobalSandboxLimit(env),
            );
        } catch (error) {
            this.logger.warn('Failed to refresh global sandbox capacity slot', {
                agentId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
}
