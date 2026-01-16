/* eslint-disable @typescript-eslint/naming-convention */
import type { APIThreadChannel } from 'discord-api-types/v10';

import type { RedisWrapperInterface } from '../RedisWrapper.js';

import Cache, { type QueueFn } from './Base/Cache.js';

export type RThread = Pick<
 APIThreadChannel,
 | 'id'
 | 'name'
 | 'type'
 | 'flags'
 | 'last_message_id'
 | 'last_pin_timestamp'
 | 'rate_limit_per_user'
 | 'owner_id'
 | 'thread_metadata'
 | 'message_count'
 | 'member_count'
 | 'total_message_sent'
 | 'applied_tags'
 | 'parent_id'
> & {
 guild_id: string;
 member_id: string | null;
};

export const RThreadKeys = [
 'id',
 'name',
 'type',
 'flags',
 'last_message_id',
 'last_pin_timestamp',
 'rate_limit_per_user',
 'owner_id',
 'thread_metadata',
 'message_count',
 'member_count',
 'total_message_sent',
 'applied_tags',
 'guild_id',
 'member_id',
 'parent_id',
] as const;

export default class ThreadCache extends Cache<
 APIThreadChannel & { guild_id: string; member_id: string },
 true
> {
 public keys = RThreadKeys;

 constructor(redis: RedisWrapperInterface, queueFn?: QueueFn) {
  super(redis, 'threads', queueFn);
 }

 async set(data: Omit<APIThreadChannel, 'position'>) {
  const rData = this.apiToR(data);
  if (!rData) return false;
  if (!rData.guild_id || !rData.id) return false;

  await this.setValue(rData, [rData.guild_id], [rData.id]);
  return true;
 }

 async get(threadId: string) {
  return super.get(threadId);
 }

 apiToR(data: Omit<APIThreadChannel, 'position'>) {
  if (!data.guild_id) return false;
  const keysNotToCache = Object.keys(data).filter(
   (key): key is keyof typeof data => !this.keys.includes(key as (typeof this.keys)[number]),
  );

  const rData = structuredClone(data) as unknown as RThread;
  rData.member_id = data.member?.id || null;

  keysNotToCache.forEach((k) => delete (rData as Record<string, unknown>)[k as string]);

  return rData;
 }

 async deleteByParent(guildId: string, parentId: string): Promise<number> {
  const allThreads = await this.getAll(guildId);
  const childThreads = allThreads.filter((t) => t.parent_id === parentId);
  if (childThreads.length === 0) return 0;

  const pipeline = this.redis.pipeline();

  for (const thread of childThreads) {
   pipeline.del(this.key(thread.id, 'current'));
   pipeline.hdel(this.keystore(guildId), this.key(thread.id));
  }

  await pipeline.exec();
  return childThreads.length;
 }
}
