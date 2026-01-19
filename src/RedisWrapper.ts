/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Unified Redis wrapper that works with both Bun and Node.js runtimes.
 *
 * - In Bun: Uses native Bun RedisClient (Zig-based, lower memory)
 * - In Node.js: Uses ioredis
 *
 * Both implementations provide the same interface including HSCAN helpers.
 */

const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';

// Common interface for both implementations
export interface RedisWrapperInterface {
 readonly options: { db: number };

 // Basic operations
 get(key: string): Promise<string | null>;
 set(key: string, value: string, ...args: unknown[]): Promise<string | null>;
 del(...keys: string[]): Promise<number>;

 // Hash operations
 hset(key: string, field: string, value: unknown): Promise<number>;
 hget(key: string, field: string): Promise<string | null>;
 hgetall(key: string): Promise<Record<string, string>>;
 hkeys(key: string): Promise<string[]>;
 hdel(key: string, ...fields: string[]): Promise<number>;

 // HSCAN helpers (non-blocking alternatives to HGETALL)
 hscan(key: string, cursor: string, match?: string, count?: number): Promise<[string, string[]]>;
 hscanKeys(key: string, match?: string, batchSize?: number): Promise<string[]>;
 hscanAll(key: string, match?: string, batchSize?: number): Promise<Record<string, string>>;

 // Expiration
 expire(key: string, seconds: number): Promise<number>;

 // Scripting
 eval(script: string, numKeys: number, ...args: unknown[]): Promise<unknown>;
 call(command: string, ...args: unknown[]): Promise<unknown>;

 // Config and Pub/Sub
 config(command: string, ...args: unknown[]): Promise<unknown>;
 subscribe(...channels: string[]): Promise<number | void>;
 publish(channel: string, message: string): Promise<number>;

 // Events
 on(event: string, handler: (...args: unknown[]) => void): this;
 once(event: string, handler: (...args: unknown[]) => void): this;

 // Pipeline
 pipeline(): ChainableCommanderInterface;

 // Connection
 quit(): Promise<'OK'>;
 disconnect(): Promise<void>;

 getQueueSize(): number;
}

export interface ChainableCommanderInterface {
 commands?: Array<{ method: string; args: unknown[] }>;
 set(key: string, value: string, ...args: unknown[]): this;
 get(key: string): this;
 del(...keys: string[]): this;
 hset(key: string, ...args: unknown[]): this;
 hget(key: string, field: string): this;
 hgetall(key: string): this;
 hkeys(key: string): this;
 hdel(key: string, ...fields: string[]): this;
 expire(key: string, seconds: number): this;
 hexpire(key: string, seconds: number, ...args: unknown[]): this;
 eval(script: string, numKeys: number, ...args: unknown[]): this;
 call(command: string, ...args: unknown[]): this;
 exec(): Promise<Array<[Error | null, unknown]> | null>;
}

export type RedisWrapperOptions = {
 host?: string;
 db?: number;
};

// Dynamic import based on runtime - resolved at module load time using top-level await
type RedisWrapperConstructor = new (options?: RedisWrapperOptions) => RedisWrapperInterface;

const RedisWrapperClass: RedisWrapperConstructor = isBun
 ? (await import('./BunRedis.js')).BunRedisWrapper
 : (await import('./NodeRedis.js')).NodeRedisWrapper;

/**
 * Create a new Redis wrapper instance.
 * Automatically selects the appropriate implementation based on runtime.
 */
export const createRedisWrapper = (options?: RedisWrapperOptions): RedisWrapperInterface =>
 new RedisWrapperClass(options);

/**
 * The Redis wrapper class for the current runtime.
 * Use this if you need to extend or type-check against the class.
 */
export const RedisWrapper = RedisWrapperClass;

/**
 * Whether the current runtime is Bun.
 */
export const isRunningInBun = isBun;

export default RedisWrapper;
