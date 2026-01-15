/* eslint-disable @typescript-eslint/naming-convention */
import type { APIApplicationCommandPermission } from 'discord-api-types/v10';

import type BunRedisWrapper from '../BunRedis.js';

import Cache, { type QueueFn } from './Base/Cache.js';

export type RCommandPermission = APIApplicationCommandPermission & {
 guild_id: string;
 command_id: string;
};

export const RCommandPermissionKeys = [
 'id',
 'type',
 'permission',
 'guild_id',
 'command_id',
] as const;

export default class CommandPermissionCache extends Cache<APIApplicationCommandPermission> {
 public keys = RCommandPermissionKeys;

 constructor(redis: BunRedisWrapper, queueFn?: QueueFn) {
  super(redis, 'command-permissions', queueFn);
 }

 async set(data: APIApplicationCommandPermission, guildId: string, commandId: string) {
  const rData = this.apiToR(data, guildId, commandId);
  if (!rData) return false;
  if (!rData.guild_id || !rData.command_id || !rData.id) return false;

  await this.setValue(rData, [rData.guild_id], [rData.command_id, rData.id]);
  return true;
 }

 async get(commandId: string, permissionId: string) {
  return super.get(commandId, permissionId);
 }

 apiToR(data: APIApplicationCommandPermission, guildId: string, commandId: string) {
  const keysNotToCache = Object.keys(data).filter(
   (key): key is keyof typeof data => !this.keys.includes(key as (typeof this.keys)[number]),
  );

  const rData = structuredClone(data) as unknown as RCommandPermission;
  rData.guild_id = guildId;
  rData.command_id = commandId;

  keysNotToCache.forEach((k) => delete (rData as unknown as Record<string, unknown>)[k as string]);

  return structuredClone(rData);
 }
}
