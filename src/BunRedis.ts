import { RedisClient } from 'bun';

export type BunChainableCommander = {
 commands: Array<{ method: string; args: unknown[] }>;
 set(key: string, value: string, ...args: unknown[]): BunChainableCommander;
 get(key: string): BunChainableCommander;
 del(...keys: string[]): BunChainableCommander;
 hset(key: string, ...args: unknown[]): BunChainableCommander;
 hget(key: string, field: string): BunChainableCommander;
 hgetall(key: string): BunChainableCommander;
 hkeys(key: string): BunChainableCommander;
 hdel(key: string, ...fields: string[]): BunChainableCommander;
 expire(key: string, seconds: number): BunChainableCommander;
 hexpire(key: string, seconds: number, ...args: unknown[]): BunChainableCommander;
 eval(script: string, numKeys: number, ...args: unknown[]): BunChainableCommander;
 call(command: string, ...args: unknown[]): BunChainableCommander;
 exec(): Promise<Array<[Error | null, unknown]> | null>;
};

type QueuedRequest = {
 method: string;
 args: unknown[];
 resolve: (value: unknown) => void;
 reject: (error: Error) => void;
 retries: number;
};

let instanceCounter = 0;

export class BunRedisWrapper {
 private client: RedisClient;
 private initPromise: Promise<void> | null = null;
 private readonly host: string;
 readonly options: { db: number };
 private readonly instanceId: number;

 private requestQueue: QueuedRequest[] = [];
 private processing = false;
 private readonly maxRetries = 1;
 private readonly timeoutMs = 5000;
 private readonly slowThresholdMs = 100;

 constructor(options: { host?: string; db?: number } = {}) {
  this.instanceId = instanceCounter++;
  this.host = options.host || 'localhost';
  const db = options.db || 0;
  this.options = { db };
  // eslint-disable-next-line no-console
  console.log(`[Redis#${this.instanceId}] Created instance for db ${db}`);

  this.client = new RedisClient(`redis://${this.host}:6379`);

  if (db !== 0) {
   this.initPromise = this.client.send('SELECT', [String(db)]).then(() => {
    this.initPromise = null;
   });
  }
 }

 private reconnect(): void {
  // eslint-disable-next-line no-console
  console.log('[Redis] Reconnecting...');
  try {
   this.client.close();
  } catch {
   // ignore close errors
  }
  this.client = new RedisClient(`redis://${this.host}:6379`);
  if (this.options.db !== 0) {
   this.initPromise = this.client.send('SELECT', [String(this.options.db)]).then(() => {
    this.initPromise = null;
   });
  }
 }

 private async ensureInit(): Promise<void> {
  if (this.initPromise) {
   const start = Date.now();
   const timeout = new Promise<void>((_, reject) =>
    setTimeout(() => reject(new Error('Redis init timed out')), this.timeoutMs),
   );
   await Promise.race([this.initPromise, timeout]);
   const elapsed = Date.now() - start;
   if (elapsed > this.slowThresholdMs) {
    // eslint-disable-next-line no-console
    console.log(`[Redis#${this.instanceId}] SLOW ensureInit: ${elapsed}ms`);
   }
  }
 }

 private queueRequest(method: string, args: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
   this.requestQueue.push({ method, args, resolve, reject, retries: 0 });
   if (this.requestQueue.length % 100 === 0) {
    // eslint-disable-next-line no-console
    console.log(`[Redis#${this.instanceId}] Queue size: ${this.requestQueue.length}`);
   }
   this.processQueue();
  });
 }

 private async processQueue(): Promise<void> {
  if (this.processing || this.requestQueue.length === 0) return;

  this.processing = true;

  while (this.requestQueue.length > 0) {
   const [request] = this.requestQueue;
   const cmdStart = Date.now();

   try {
    await this.ensureInit();
    const result = await this.sendWithTimeout(request.method, request.args);
    const elapsed = Date.now() - cmdStart;
    if (elapsed > this.slowThresholdMs) {
     // eslint-disable-next-line no-console
     console.log(`[Redis#${this.instanceId}] SLOW ${request.method}: ${elapsed}ms`);
    }
    this.requestQueue.shift();
    request.resolve(result);
   } catch (err) {
    const isTimeout = err instanceof Error && err.message.includes('timed out');
    // eslint-disable-next-line no-console
    console.log(
     `[Redis#${this.instanceId}] ERROR ${request.method}: ${(err as Error).message}, isTimeout: ${isTimeout}`,
    );

    if (isTimeout && request.retries < this.maxRetries) {
     request.retries++;
     // eslint-disable-next-line no-console
     console.log(
      `[Redis#${this.instanceId}] Retry ${request.retries}/${this.maxRetries} for ${request.method}`,
     );
     this.reconnect();
     await this.ensureInit();
     continue;
    }

    this.requestQueue.shift();
    request.reject(err as Error);
   }
  }

  this.processing = false;
 }

 private async sendWithTimeout(method: string, args: unknown[]): Promise<unknown> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
   timeoutId = setTimeout(() => {
    // eslint-disable-next-line no-console
    console.log(`[Redis#${this.instanceId}] TIMEOUT ${method} after ${this.timeoutMs}ms`);
    reject(new Error(`Redis ${method} timed out after ${this.timeoutMs}ms`));
   }, this.timeoutMs);
  });

  try {
   const result = await Promise.race([this.client.send(method, args.map(String)), timeoutPromise]);
   clearTimeout(timeoutId);
   return result;
  } catch (err) {
   clearTimeout(timeoutId);
   throw err;
  }
 }

 async get(key: string): Promise<string | null> {
  return this.queueRequest('GET', [key]) as Promise<string | null>;
 }

 async set(key: string, value: string, ...args: unknown[]): Promise<string | null> {
  return this.queueRequest('SET', [key, value, ...args]) as Promise<string | null>;
 }

 async del(...keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  return this.queueRequest('DEL', keys) as Promise<number>;
 }

 async hset(key: string, field: string, value: unknown): Promise<number> {
  return this.queueRequest('HSET', [key, field, value]) as Promise<number>;
 }

 async hget(key: string, field: string): Promise<string | null> {
  return this.queueRequest('HGET', [key, field]) as Promise<string | null>;
 }

 async hgetall(key: string): Promise<Record<string, string>> {
  const start = Date.now();
  const result = (await this.queueRequest('HGETALL', [key])) as Record<string, string>;
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
  const args: unknown[] = [key, cursor];
  if (match) {
   args.push('MATCH', match);
  }
  if (count) {
   args.push('COUNT', count);
  }
  const result = (await this.queueRequest('HSCAN', args)) as [string, string[]];
  return result;
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
  return this.queueRequest('HKEYS', [key]) as Promise<string[]>;
 }

 async hdel(key: string, ...fields: string[]): Promise<number> {
  if (fields.length === 0) return 0;
  return this.queueRequest('HDEL', [key, ...fields]) as Promise<number>;
 }

 async expire(key: string, seconds: number): Promise<number> {
  return this.queueRequest('EXPIRE', [key, seconds]) as Promise<number>;
 }

 async eval(script: string, numKeys: number, ...args: unknown[]): Promise<unknown> {
  return this.queueRequest('EVAL', [script, numKeys, ...args]);
 }

 async call(command: string, ...args: unknown[]): Promise<unknown> {
  return this.queueRequest(command, args);
 }

 config(_command: string, ..._args: unknown[]): Promise<unknown> {
  return Promise.resolve('OK');
 }

 subscribe(..._channels: string[]): Promise<void> {
  return Promise.resolve();
 }

 async publish(channel: string, message: string): Promise<number> {
  return this.queueRequest('PUBLISH', [channel, message]) as Promise<number>;
 }

 on(_event: string, _handler: (...args: unknown[]) => void): this {
  return this;
 }

 once(_event: string, _handler: (...args: unknown[]) => void): this {
  return this;
 }

 pipeline(): BunChainableCommander {
  const wrapper = this;
  const commands: Array<{ method: string; args: unknown[] }> = [];

  const pipeline: BunChainableCommander = {
   commands,
   set(key: string, value: string, ...args: unknown[]) {
    commands.push({ method: 'SET', args: [key, value, ...args] });
    return this;
   },
   get(key: string) {
    commands.push({ method: 'GET', args: [key] });
    return this;
   },
   del(...keys: string[]) {
    if (keys.length === 0) return this;
    commands.push({ method: 'DEL', args: keys });
    return this;
   },
   hset(key: string, ...args: unknown[]) {
    commands.push({ method: 'HSET', args: [key, ...args] });
    return this;
   },
   hget(key: string, field: string) {
    commands.push({ method: 'HGET', args: [key, field] });
    return this;
   },
   hgetall(key: string) {
    commands.push({ method: 'HGETALL', args: [key] });
    return this;
   },
   hkeys(key: string) {
    commands.push({ method: 'HKEYS', args: [key] });
    return this;
   },
   hdel(key: string, ...fields: string[]) {
    if (fields.length === 0) return this;
    commands.push({ method: 'HDEL', args: [key, ...fields] });
    return this;
   },
   expire(key: string, seconds: number) {
    commands.push({ method: 'EXPIRE', args: [key, seconds] });
    return this;
   },
   hexpire(key: string, seconds: number, ...args: unknown[]) {
    commands.push({ method: 'HEXPIRE', args: [key, seconds, ...args] });
    return this;
   },
   eval(script: string, numKeys: number, ...args: unknown[]) {
    commands.push({ method: 'EVAL', args: [script, numKeys, ...args] });
    return this;
   },
   call(command: string, ...args: unknown[]) {
    commands.push({ method: command, args });
    return this;
   },
   async exec() {
    if (commands.length === 0) return null;

    const promises = commands.map((cmd) =>
     wrapper
      .queueRequest(cmd.method, cmd.args)
      .then((result): [Error | null, unknown] => [null, result])
      .catch((err): [Error | null, unknown] => {
       // eslint-disable-next-line no-console
       console.error(`[Redis] Command ${cmd.method} failed:`, err);
       return [err as Error, null];
      }),
    );

    return Promise.all(promises);
   },
  };

  return pipeline;
 }

 async quit(): Promise<'OK'> {
  this.client.close();
  return 'OK';
 }

 async disconnect(): Promise<void> {
  this.client.close();
 }
}

export default BunRedisWrapper;
