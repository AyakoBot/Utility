import Redis, { type ChainableCommander, type RedisOptions } from 'ioredis';

export type NodeChainableCommander = ChainableCommander & {
 hexpire(key: string, seconds: number, ...args: unknown[]): ChainableCommander;
};

let instanceCounter = 0;

/**
 * Node.js Redis wrapper using ioredis with the same interface as BunRedisWrapper.
 * Provides HSCAN helper methods for non-blocking hash iteration.
 */
export class NodeRedisWrapper {
 private client: Redis;
 private readonly host: string;
 readonly options: { db: number };
 private readonly instanceId: number;
 private readonly slowThresholdMs = 100;

 constructor(options: { host?: string; db?: number } = {}) {
  this.instanceId = instanceCounter++;
  this.host = options.host || 'localhost';
  const db = options.db || 0;
  this.options = { db };
  // eslint-disable-next-line no-console
  console.log(`[Redis#${this.instanceId}] Created instance for db ${db}`);

  const redisOptions: RedisOptions = {
   host: this.host,
   port: 6379,
   db,
  };

  this.client = new Redis(redisOptions);
 }

 async get(key: string): Promise<string | null> {
  return this.client.get(key);
 }

 async set(key: string, value: string, ...args: unknown[]): Promise<string | null> {
  if (args.length >= 2 && (args[0] === 'EX' || args[0] === 'ex')) {
   return this.client.set(key, value, 'EX', Number(args[1]));
  }
  if (args.length >= 2 && (args[0] === 'PX' || args[0] === 'px')) {
   return this.client.set(key, value, 'PX', Number(args[1]));
  }
  return this.client.set(key, value);
 }

 async del(...keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  return this.client.del(...keys);
 }

 async hset(key: string, field: string, value: unknown): Promise<number> {
  return this.client.hset(key, field, String(value));
 }

 async hget(key: string, field: string): Promise<string | null> {
  return this.client.hget(key, field);
 }

 async hgetall(key: string): Promise<Record<string, string>> {
  const start = Date.now();
  const result = await this.client.hgetall(key);
  const elapsed = Date.now() - start;
  const size = Object.keys(result || {}).length;
  if (elapsed > this.slowThresholdMs || size > 1000) {
   // eslint-disable-next-line no-console
   console.log(`[Redis#${this.instanceId}] HGETALL key="${key}" size=${size} time=${elapsed}ms`);
  }
  return result;
 }

 async hscan(
  key: string,
  cursor: string,
  match?: string,
  count?: number,
 ): Promise<[string, string[]]> {
  if (match && count) {
   return this.client.hscan(key, cursor, 'MATCH', match, 'COUNT', count);
  }
  if (match) {
   return this.client.hscan(key, cursor, 'MATCH', match);
  }
  if (count) {
   return this.client.hscan(key, cursor, 'COUNT', count);
  }
  return this.client.hscan(key, cursor);
 }

 async hscanKeys(key: string, match?: string, batchSize: number = 1000): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';

  do {
   const [nextCursor, results] = await this.hscan(key, cursor, match, batchSize);
   cursor = nextCursor;
   for (let i = 0; i < results.length; i += 2) {
    keys.push(results[i]);
   }
  } while (cursor !== '0');

  return keys;
 }

 async hscanAll(
  key: string,
  match?: string,
  batchSize: number = 1000,
 ): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  let cursor = '0';

  do {
   const [nextCursor, results] = await this.hscan(key, cursor, match, batchSize);
   cursor = nextCursor;
   for (let i = 0; i < results.length; i += 2) {
    result[results[i]] = results[i + 1];
   }
  } while (cursor !== '0');

  return result;
 }

 async hkeys(key: string): Promise<string[]> {
  return this.client.hkeys(key);
 }

 async hdel(key: string, ...fields: string[]): Promise<number> {
  if (fields.length === 0) return 0;
  return this.client.hdel(key, ...fields);
 }

 async expire(key: string, seconds: number): Promise<number> {
  return this.client.expire(key, seconds);
 }

 async eval(script: string, numKeys: number, ...args: unknown[]): Promise<unknown> {
  return this.client.eval(script, numKeys, ...args.map(String));
 }

 async call(command: string, ...args: unknown[]): Promise<unknown> {
  return this.client.call(command, ...args.map(String));
 }

 config(command: string, ...args: unknown[]): Promise<unknown> {
  return this.client.call('CONFIG', command, ...args.map(String));
 }

 async subscribe(...channels: string[]): Promise<number> {
  const result = await this.client.subscribe(...channels);
  return typeof result === 'number' ? result : channels.length;
 }

 async publish(channel: string, message: string): Promise<number> {
  return this.client.publish(channel, message);
 }

 on(event: string, handler: (...args: unknown[]) => void): this {
  this.client.on(event, handler);
  return this;
 }

 once(event: string, handler: (...args: unknown[]) => void): this {
  this.client.once(event, handler);
  return this;
 }

 pipeline(): NodeChainableCommander {
  const pipe = this.client.pipeline() as NodeChainableCommander;

  const originalHexpire = pipe.hexpire;
  if (!originalHexpire) {
   (pipe as unknown as Record<string, unknown>).hexpire = function (
    this: ChainableCommander,
    key: string,
    seconds: number,
    ...args: unknown[]
   ) {
    return this.call('HEXPIRE', key, String(seconds), ...args.map(String));
   };
  }

  const originalDel = pipe.del.bind(pipe);
  (pipe as unknown as Record<string, unknown>).del = function (...keys: string[]) {
   if (keys.length === 0) return pipe;
   return originalDel(...keys);
  };

  const originalHdel = pipe.hdel.bind(pipe);
  (pipe as unknown as Record<string, unknown>).hdel = function (key: string, ...fields: string[]) {
   if (fields.length === 0) return pipe;
   return originalHdel(key, ...fields);
  };

  return pipe;
 }

 async quit(): Promise<'OK'> {
  await this.client.quit();
  return 'OK';
 }

 async disconnect(): Promise<void> {
  this.client.disconnect();
 }

 getQueueSize(): number {
  return 0;
 }
}

export default NodeRedisWrapper;
