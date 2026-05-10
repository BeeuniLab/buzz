import { DurableObject } from 'cloudflare:workers';

export interface RateLimitBucket {
    count: number;
    timestamp: number;
}

export interface RateLimitState {
    buckets: Map<string, RateLimitBucket>;
    lastCleanup: number;
    activeTasks: Map<string, ActiveTaskLease>;
    waitingTasks: Map<string, ActiveTaskLease>;
    lastTaskCleanup: number;
}

export interface RateLimitConfig {
    limit: number;
    period: number; // in seconds
    burst?: number;
    burstWindow?: number; // in seconds
    bucketSize?: number; // in seconds
    dailyLimit?: number; // max requests in a rolling 24h window
}

export interface RateLimitResult {
    success: boolean;
    remainingLimit?: number;
    exceededLimit?: 'main' | 'burst' | 'daily';
    limitValue?: number;
    periodSeconds?: number;
}

export interface ActiveTaskLease {
    taskId: string;
    userId: string;
    agentId?: string;
    kind?: string;
    createdAt: number;
    updatedAt: number;
    expiresAt: number;
}

export interface TaskSlotResult {
    success: boolean;
    activeCount: number;
    limit: number;
    tasks: ActiveTaskLease[];
}

export interface TaskQueueSlotResult extends TaskSlotResult {
    waitingCount: number;
    position?: number;
    waitingTasks: ActiveTaskLease[];
}

/**
 * DORateLimitStore - Durable Object-based rate limiting store
 * 
 * Provides distributed rate limiting using bucketed sliding window algorithm
 * similar to the KV implementation but with better scalability, consistency and cost-effectiveness
 */
export class DORateLimitStore extends DurableObject<Env> {
    private state: RateLimitState = {
        buckets: new Map(),
        lastCleanup: Date.now(),
        activeTasks: new Map(),
        waitingTasks: new Map(),
        lastTaskCleanup: Date.now()
    };
    private initialized = false;

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
    }

    async increment(key: string, config: RateLimitConfig, incrementBy: number = 1): Promise<RateLimitResult> {
        await this.ensureInitialized();
        
        const now = Date.now();
        const bucketSize = (config.bucketSize || 10) * 1000; // Convert to milliseconds
        const burstWindow = (config.burstWindow || 60) * 1000; // Convert to milliseconds
        const mainWindow = config.period * 1000; // Convert to milliseconds
        const dailyWindow = config.dailyLimit ? 24 * 60 * 60 * 1000 : 0; // 24 hours in ms if enabled

        const currentBucket = Math.floor(now / bucketSize) * bucketSize;
        const bucketKey = `${key}:${currentBucket}`;

        // Periodic cleanup every 5 minutes
        if (now - this.state.lastCleanup > 5 * 60 * 1000) {
            await this.cleanup(now, Math.max(mainWindow, burstWindow, dailyWindow));
        }

        // Calculate current counts
        const mainBuckets = this.getBucketsInWindow(key, now, mainWindow, bucketSize);
        const burstBuckets = config.burst ? this.getBucketsInWindow(key, now, burstWindow, bucketSize) : [];
        const dailyBuckets = config.dailyLimit ? this.getBucketsInWindow(key, now, dailyWindow, bucketSize) : [];

        const mainCount = mainBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
        const burstCount = burstBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
        const dailyCount = dailyBuckets.reduce((sum, bucket) => sum + bucket.count, 0);

        // Check limits
        if (mainCount >= config.limit) {
            return {
                success: false,
                remainingLimit: 0,
                exceededLimit: 'main',
                limitValue: config.limit,
                periodSeconds: config.period
            };
        }

        if (config.burst && burstCount >= config.burst) {
            return {
                success: false,
                remainingLimit: 0,
                exceededLimit: 'burst',
                limitValue: config.burst,
                periodSeconds: config.burstWindow
            };
        }

        if (config.dailyLimit && dailyCount >= config.dailyLimit) {
            return {
                success: false,
                remainingLimit: 0,
                exceededLimit: 'daily',
                limitValue: config.dailyLimit,
                periodSeconds: 24 * 60 * 60
            };
        }

        // Increment current bucket
        const existing = this.state.buckets.get(bucketKey);
        const newCount = (existing?.count || 0) + incrementBy;
        
        this.state.buckets.set(bucketKey, {
            count: newCount,
            timestamp: now
        });

        await this.persistState();

        // Compute remaining across applicable windows
        const mainRemaining = config.limit - mainCount - incrementBy;
        const dailyRemaining = config.dailyLimit != null ? (config.dailyLimit - dailyCount - incrementBy) : undefined;
        const remaining = dailyRemaining != null ? Math.min(mainRemaining, dailyRemaining) : mainRemaining;

        return { 
            success: true, 
            remainingLimit: Math.max(0, remaining) 
        };
    }

    async getRemainingLimit(key: string, config: RateLimitConfig): Promise<number> {
        await this.ensureInitialized();
        
        const now = Date.now();
        const bucketSize = (config.bucketSize || 10) * 1000;
        const mainWindow = config.period * 1000;
        const dailyWindow = config.dailyLimit ? 24 * 60 * 60 * 1000 : 0;

        const mainBuckets = this.getBucketsInWindow(key, now, mainWindow, bucketSize);
        const mainCount = mainBuckets.reduce((sum, bucket) => sum + bucket.count, 0);

        const mainRemaining = config.limit - mainCount;

        if (config.dailyLimit) {
            const dailyBuckets = this.getBucketsInWindow(key, now, dailyWindow, bucketSize);
            const dailyCount = dailyBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
            const dailyRemaining = config.dailyLimit - dailyCount;
            return Math.max(0, Math.min(mainRemaining, dailyRemaining));
        }

        return Math.max(0, mainRemaining);
    }

    async resetLimit(key?: string): Promise<void> {
        await this.ensureInitialized();
        
        if (key) {
            // Reset specific key buckets
            const keysToDelete = Array.from(this.state.buckets.keys())
                .filter(bucketKey => bucketKey.startsWith(`${key}:`));
            
            for (const bucketKey of keysToDelete) {
                this.state.buckets.delete(bucketKey);
            }
        } else {
            // Reset all buckets
            this.state.buckets.clear();
        }

        await this.persistState();
    }

    async acquireTaskSlot(
        taskId: string,
        task: Omit<ActiveTaskLease, 'taskId' | 'createdAt' | 'updatedAt' | 'expiresAt'>,
        limit: number,
        ttlMs: number,
    ): Promise<TaskSlotResult> {
        await this.ensureInitialized();

        const now = Date.now();
        this.cleanupExpiredTasks(now);

        const existing = this.state.activeTasks.get(taskId);
        if (existing) {
            const refreshed = {
                ...existing,
                ...task,
                updatedAt: now,
                expiresAt: now + ttlMs,
            };
            this.state.activeTasks.set(taskId, refreshed);
            await this.persistState();
            return this.buildTaskSlotResult(true, limit);
        }

        if (this.state.activeTasks.size >= limit) {
            await this.persistTaskCleanupIfNeeded(now);
            return this.buildTaskSlotResult(false, limit);
        }

        this.state.activeTasks.set(taskId, {
            taskId,
            ...task,
            createdAt: now,
            updatedAt: now,
            expiresAt: now + ttlMs,
        });

        await this.persistState();
        return this.buildTaskSlotResult(true, limit);
    }

    async acquireQueuedTaskSlot(
        taskId: string,
        task: Omit<ActiveTaskLease, 'taskId' | 'createdAt' | 'updatedAt' | 'expiresAt'>,
        limit: number,
        ttlMs: number,
    ): Promise<TaskQueueSlotResult> {
        await this.ensureInitialized();

        const now = Date.now();
        this.cleanupExpiredTasks(now);

        const existingActive = this.state.activeTasks.get(taskId);
        if (existingActive) {
            this.state.activeTasks.set(taskId, {
                ...existingActive,
                ...task,
                updatedAt: now,
                expiresAt: now + ttlMs,
            });
            this.state.waitingTasks.delete(taskId);
            await this.persistState();
            return this.buildTaskQueueSlotResult(true, limit);
        }

        const existingWaiting = this.state.waitingTasks.get(taskId);
        if (existingWaiting) {
            this.state.waitingTasks.set(taskId, {
                ...existingWaiting,
                ...task,
                updatedAt: now,
                expiresAt: now + ttlMs,
            });
        } else {
            this.state.waitingTasks.set(taskId, {
                taskId,
                ...task,
                createdAt: now,
                updatedAt: now,
                expiresAt: now + ttlMs,
            });
        }

        const orderedWaiting = this.getOrderedWaitingTasks();
        const isNextInQueue = orderedWaiting[0]?.taskId === taskId;

        if (this.state.activeTasks.size < limit && isNextInQueue) {
            const waitingTask = this.state.waitingTasks.get(taskId);
            this.state.waitingTasks.delete(taskId);
            this.state.activeTasks.set(taskId, {
                taskId,
                ...task,
                createdAt: waitingTask?.createdAt ?? now,
                updatedAt: now,
                expiresAt: now + ttlMs,
            });
            await this.persistState();
            return this.buildTaskQueueSlotResult(true, limit);
        }

        await this.persistState();
        return this.buildTaskQueueSlotResult(false, limit, taskId);
    }

    async touchTaskSlot(taskId: string, ttlMs: number, limit: number): Promise<TaskSlotResult> {
        await this.ensureInitialized();

        const now = Date.now();
        this.cleanupExpiredTasks(now);

        const existing = this.state.activeTasks.get(taskId);
        if (existing) {
            this.state.activeTasks.set(taskId, {
                ...existing,
                updatedAt: now,
                expiresAt: now + ttlMs,
            });
            await this.persistState();
        } else {
            await this.persistTaskCleanupIfNeeded(now);
        }

        return this.buildTaskSlotResult(Boolean(existing), limit);
    }

    async upsertTaskSlot(
        taskId: string,
        task: Omit<ActiveTaskLease, 'taskId' | 'createdAt' | 'updatedAt' | 'expiresAt'>,
        limit: number,
        ttlMs: number,
    ): Promise<TaskSlotResult> {
        await this.ensureInitialized();

        const now = Date.now();
        this.cleanupExpiredTasks(now);

        const existing = this.state.activeTasks.get(taskId);
        this.state.activeTasks.set(taskId, {
            ...existing,
            taskId,
            ...task,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
            expiresAt: now + ttlMs,
        });

        await this.persistState();
        return this.buildTaskSlotResult(true, limit);
    }

    async releaseTaskSlot(taskId: string, limit: number): Promise<TaskSlotResult> {
        await this.ensureInitialized();

        const now = Date.now();
        this.cleanupExpiredTasks(now);
        const existed = this.state.activeTasks.delete(taskId);

        if (existed) {
            await this.persistState();
        } else {
            await this.persistTaskCleanupIfNeeded(now);
        }

        return this.buildTaskSlotResult(true, limit);
    }

    async releaseQueuedTaskSlot(taskId: string, limit: number): Promise<TaskQueueSlotResult> {
        await this.ensureInitialized();

        const now = Date.now();
        this.cleanupExpiredTasks(now);
        const activeExisted = this.state.activeTasks.delete(taskId);
        const waitingExisted = this.state.waitingTasks.delete(taskId);

        if (activeExisted || waitingExisted) {
            await this.persistState();
        } else {
            await this.persistTaskCleanupIfNeeded(now);
        }

        return this.buildTaskQueueSlotResult(true, limit);
    }

    private getBucketsInWindow(key: string, now: number, windowMs: number, bucketSizeMs: number): RateLimitBucket[] {
        const buckets: RateLimitBucket[] = [];
        const windowStart = now - windowMs;
        
        for (let time = Math.floor(windowStart / bucketSizeMs) * bucketSizeMs; time <= now; time += bucketSizeMs) {
            const bucketKey = `${key}:${time}`;
            const bucket = this.state.buckets.get(bucketKey);
            if (bucket) {
                buckets.push(bucket);
            }
        }
        
        return buckets;
    }

    private async cleanup(now: number, maxWindow: number): Promise<void> {
        const cutoff = now - maxWindow;
        let needsUpdate = false;

        for (const [bucketKey, bucket] of this.state.buckets) {
            if (bucket.timestamp < cutoff) {
                this.state.buckets.delete(bucketKey);
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            this.state.lastCleanup = now;
            await this.persistState();
        }
    }

    private cleanupExpiredTasks(now: number): boolean {
        let needsUpdate = false;

        for (const [taskId, task] of this.state.activeTasks) {
            if (task.expiresAt <= now) {
                this.state.activeTasks.delete(taskId);
                needsUpdate = true;
            }
        }

        for (const [taskId, task] of this.state.waitingTasks) {
            if (task.expiresAt <= now) {
                this.state.waitingTasks.delete(taskId);
                needsUpdate = true;
            }
        }

        if (needsUpdate || now - this.state.lastTaskCleanup > 5 * 60 * 1000) {
            this.state.lastTaskCleanup = now;
            needsUpdate = true;
        }

        return needsUpdate;
    }

    private async persistTaskCleanupIfNeeded(now: number): Promise<void> {
        if (this.cleanupExpiredTasks(now)) {
            await this.persistState();
        }
    }

    private buildTaskSlotResult(success: boolean, limit: number): TaskSlotResult {
        return {
            success,
            activeCount: this.state.activeTasks.size,
            limit,
            tasks: Array.from(this.state.activeTasks.values()),
        };
    }

    private getOrderedWaitingTasks(): ActiveTaskLease[] {
        return Array.from(this.state.waitingTasks.values())
            .sort((a, b) => a.createdAt - b.createdAt || a.taskId.localeCompare(b.taskId));
    }

    private buildTaskQueueSlotResult(success: boolean, limit: number, taskId?: string): TaskQueueSlotResult {
        const waitingTasks = this.getOrderedWaitingTasks();
        const waitingIndex = taskId ? waitingTasks.findIndex(task => task.taskId === taskId) : -1;
        return {
            ...this.buildTaskSlotResult(success, limit),
            waitingCount: waitingTasks.length,
            ...(waitingIndex >= 0 ? { position: waitingIndex + 1 } : {}),
            waitingTasks,
        };
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.initialized) {
            const stored = await this.ctx.storage.get<{
                buckets: [string, RateLimitBucket][];
                lastCleanup: number;
                activeTasks?: [string, ActiveTaskLease][];
                waitingTasks?: [string, ActiveTaskLease][];
                lastTaskCleanup?: number;
            }>('state');
            
            if (stored) {
                this.state = {
                    buckets: new Map(stored.buckets),
                    lastCleanup: stored.lastCleanup,
                    activeTasks: new Map(stored.activeTasks ?? []),
                    waitingTasks: new Map(stored.waitingTasks ?? []),
                    lastTaskCleanup: stored.lastTaskCleanup ?? Date.now()
                };
            }
            
            this.initialized = true;
        }
    }

    private async persistState(): Promise<void> {
        await this.ctx.storage.put('state', {
            buckets: Array.from(this.state.buckets.entries()),
            lastCleanup: this.state.lastCleanup,
            activeTasks: Array.from(this.state.activeTasks.entries()),
            waitingTasks: Array.from(this.state.waitingTasks.entries()),
            lastTaskCleanup: this.state.lastTaskCleanup
        });
    }
}
