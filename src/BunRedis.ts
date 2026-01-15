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

export class BunRedisWrapper {
 private client: RedisClient;
 private initPromise: Promise<void> | null = null;
 readonly options: { db: number };

 constructor(options: { host?: string; db?: number } = {}) {
  const host = options.host || 'localhost';
  const db = options.db || 0;
  this.options = { db };

  this.client = new RedisClient(`redis://${host}:6379`);

  if (db !== 0) {
   this.initPromise = this.client.send('SELECT', [String(db)]).then(() => {
    this.initPromise = null;
   });
  }
 }

 private async ensureInit(): Promise<void> {
  if (this.initPromise) {
   await this.initPromise;
  }
 }

 async get(key: string): Promise<string | null> {
  await this.ensureInit();
  return this.client.get(key);
 }

 async set(key: string, value: string, ...args: unknown[]): Promise<string | null> {
  await this.ensureInit();
  if (args.length === 0) {
   return this.client.set(key, value);
  }
  return this.client.send('SET', [key, value, ...args.map(String)]) as Promise<string | null>;
 }

 async del(...keys: string[]): Promise<number> {
  await this.ensureInit();
  if (keys.length === 0) return 0;
  if (keys.length === 1) return this.client.del(keys[0]);
  return this.client.send('DEL', keys) as Promise<number>;
 }

 async hset(key: string, field: string, value: unknown): Promise<number> {
  await this.ensureInit();
  return this.client.hset(key, field, String(value));
 }

 async hget(key: string, field: string): Promise<string | null> {
  await this.ensureInit();
  return this.client.hget(key, field);
 }

 async hgetall(key: string): Promise<Record<string, string>> {
  await this.ensureInit();
  return this.client.hgetall(key) as Promise<Record<string, string>>;
 }

 async hkeys(key: string): Promise<string[]> {
  await this.ensureInit();
  return this.client.hkeys(key);
 }

 async hdel(key: string, ...fields: string[]): Promise<number> {
  await this.ensureInit();
  if (fields.length === 1) return this.client.hdel(key, fields[0]);
  return this.client.send('HDEL', [key, ...fields]) as Promise<number>;
 }

 async expire(key: string, seconds: number): Promise<number> {
  await this.ensureInit();
  return this.client.expire(key, seconds);
 }

 async eval(script: string, numKeys: number, ...args: unknown[]): Promise<unknown> {
  await this.ensureInit();
  return this.client.send('EVAL', [script, String(numKeys), ...args.map(String)]);
 }

 async call(command: string, ...args: unknown[]): Promise<unknown> {
  await this.ensureInit();
  return this.client.send(command, args.map(String));
 }

 config(_command: string, ..._args: unknown[]): Promise<unknown> {
  return Promise.resolve('OK');
 }

 subscribe(..._channels: string[]): Promise<void> {
  return Promise.resolve();
 }

 async publish(channel: string, message: string): Promise<number> {
  await this.ensureInit();
  return this.client.publish(channel, message);
 }

 on(_event: string, _handler: (...args: unknown[]) => void): this {
  return this;
 }

 once(_event: string, _handler: (...args: unknown[]) => void): this {
  return this;
 }

 pipeline(): BunChainableCommander {
  const { client } = this;
  const ensureInit = this.ensureInit.bind(this);
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

    await ensureInit();

    const sendWithTimeout = async (method: string, args: unknown[], timeoutMs = 5000) => {
     let timeoutId: ReturnType<typeof setTimeout> | undefined;
     const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`Redis ${method} timed out after ${timeoutMs}ms`)), timeoutMs);
     });

     try {
      const result = await Promise.race([client.send(method, args.map(String)), timeoutPromise]);
      clearTimeout(timeoutId);
      return result;
     } catch (err) {
      clearTimeout(timeoutId);
      throw err;
     }
    };

    const results: Array<[Error | null, unknown]> = [];

    for (const cmd of commands) {
     try {
      const result = await sendWithTimeout(cmd.method, cmd.args);
      results.push([null, result]);
     } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[Redis] Command ${cmd.method} failed:`, err);
      results.push([err as Error, null]);
     }
    }

    return results;
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
