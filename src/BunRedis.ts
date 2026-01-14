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

const createPipeline = (client: RedisClient): BunChainableCommander => {
 const commands: Array<{ method: string; args: unknown[] }> = [];

 const pipeline: BunChainableCommander = {
  commands,
  set(key: string, value: string, ...args: unknown[]) {
   commands.push({ method: 'set', args: [key, value, ...args] });
   return this;
  },
  get(key: string) {
   commands.push({ method: 'get', args: [key] });
   return this;
  },
  del(...keys: string[]) {
   commands.push({ method: 'del', args: keys });
   return this;
  },
  hset(key: string, ...args: unknown[]) {
   commands.push({ method: 'hset', args: [key, ...args] });
   return this;
  },
  hget(key: string, field: string) {
   commands.push({ method: 'hget', args: [key, field] });
   return this;
  },
  hgetall(key: string) {
   commands.push({ method: 'hgetall', args: [key] });
   return this;
  },
  hkeys(key: string) {
   commands.push({ method: 'hkeys', args: [key] });
   return this;
  },
  hdel(key: string, ...fields: string[]) {
   commands.push({ method: 'hdel', args: [key, ...fields] });
   return this;
  },
  expire(key: string, seconds: number) {
   commands.push({ method: 'expire', args: [key, seconds] });
   return this;
  },
  hexpire(key: string, seconds: number, ...args: unknown[]) {
   commands.push({ method: 'call', args: ['hexpire', key, seconds, ...args] });
   return this;
  },
  eval(script: string, numKeys: number, ...args: unknown[]) {
   commands.push({ method: 'eval', args: [script, numKeys, ...args] });
   return this;
  },
  call(command: string, ...args: unknown[]) {
   commands.push({ method: 'call', args: [command, ...args] });
   return this;
  },
  async exec() {
   if (commands.length === 0) return null;

   const promises = commands.map(async (cmd) => {
    try {
     const method = cmd.method as keyof RedisClient;
     const result = await (client[method] as (...args: unknown[]) => Promise<unknown>)(...cmd.args);
     return [null, result] as [null, unknown];
    } catch (err) {
     return [err as Error, null] as [Error, null];
    }
   });

   return Promise.all(promises);
  },
 };

 return pipeline;
};

export class BunRedisWrapper {
 private client: RedisClient;
 readonly options: { db: number };

 constructor(options: { host?: string; db?: number } = {}) {
  const host = options.host || 'localhost';
  const db = options.db || 0;
  this.options = { db };

  this.client = new RedisClient(`redis://${host}:6379/${db}`);
 }

 async get(key: string): Promise<string | null> {
  return this.client.get(key);
 }

 async set(key: string, value: string, ...args: unknown[]): Promise<'OK'> {
  return this.client.set(key, value, ...(args as string[]));
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
  return this.client.hgetall(key) as Promise<Record<string, string>>;
 }

 async hkeys(key: string): Promise<string[]> {
  return this.client.hkeys(key);
 }

 async hdel(key: string, ...fields: string[]): Promise<number> {
  return this.client.hdel(key, ...fields);
 }

 async expire(key: string, seconds: number): Promise<number> {
  return this.client.expire(key, seconds);
 }

 async eval(script: string, numKeys: number, ...args: unknown[]): Promise<unknown> {
  return this.client.eval(script, numKeys, ...args);
 }

 async call(command: string, ...args: unknown[]): Promise<unknown> {
  return this.client.call(command, ...args);
 }

 config(_command: string, ..._args: unknown[]): Promise<unknown> {
  return Promise.resolve('OK');
 }

 subscribe(..._channels: string[]): Promise<void> {
  return Promise.resolve();
 }

 on(_event: string, _handler: (...args: unknown[]) => void): this {
  return this;
 }

 once(_event: string, _handler: (...args: unknown[]) => void): this {
  return this;
 }

 pipeline(): BunChainableCommander {
  return createPipeline(this.client);
 }

 async quit(): Promise<'OK'> {
  await this.client.quit();
  return 'OK';
 }

 async disconnect(): Promise<void> {
  await this.client.quit();
 }
}

export default BunRedisWrapper;
