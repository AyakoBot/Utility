/* eslint-disable @typescript-eslint/naming-convention */
import type { APIGuildWelcomeScreen } from 'discord-api-types/v10';

import type { RedisWrapperInterface } from '../RedisWrapper.js';

import Cache, { type QueueFn } from './Base/Cache.js';

export type RWelcomeScreen = APIGuildWelcomeScreen & { guild_id: string };

export const RWelcomeScreenKeys = ['description', 'welcome_channels', 'guild_id'] as const;

export default class WelcomeScreenCache extends Cache<APIGuildWelcomeScreen> {
 public keys = RWelcomeScreenKeys;

 constructor(redis: RedisWrapperInterface, queueFn?: QueueFn) {
  super(redis, 'welcome-screens', queueFn);
 }

 async set(data: APIGuildWelcomeScreen, guildId: string) {
  const rData = this.apiToR(data, guildId);
  if (!rData) return false;
  if (!guildId) return false;

  await this.setValue(rData, [guildId], [guildId]);
  return true;
 }

 async get(guildId: string) {
  return super.get(guildId);
 }

 apiToR(data: APIGuildWelcomeScreen, guildId: string) {
  const keysNotToCache = Object.keys(data).filter(
   (key): key is keyof typeof data => !this.keys.includes(key as (typeof this.keys)[number]),
  );

  const rData = structuredClone(data) as unknown as RWelcomeScreen;
  rData.guild_id = guildId;

  keysNotToCache.forEach((k) => delete (rData as unknown as Record<string, unknown>)[k as string]);

  return rData;
 }
}
