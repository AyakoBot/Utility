/* eslint-disable @typescript-eslint/naming-convention */
import type {
 APIApplicationCommand,
 APIApplicationCommandPermission,
 APIAuditLogEntry,
 APIAutoModerationRule,
 APIBan,
 APIEmoji,
 APIGuild,
 APIGuildChannel,
 APIGuildIntegration,
 APIGuildMember,
 APIGuildOnboarding,
 APIGuildScheduledEvent,
 APIGuildScheduledEventUser,
 APIGuildWelcomeScreen,
 APIInvite,
 APIMessage,
 APIReaction,
 APIRole,
 APISoundboardSound,
 APIStageInstance,
 APISticker,
 APIThreadChannel,
 APIThreadMember,
 APIUser,
 APIVoiceState,
 APIWebhook,
} from 'discord-api-types/v10';

import type { ChainableCommanderInterface, RedisWrapperInterface } from '../../RedisWrapper.js';
import { deserialize, serialize } from '../../Serialization.js';
import type { RAuditLog } from '../auditlog.js';
import type { RAutomod } from '../automod.js';
import type { RBan } from '../ban.js';
import type { RChannel, RChannelTypes } from '../channel.js';
import type { RCommand } from '../command.js';
import type { RCommandPermission } from '../commandPermission.js';
import type { REmoji } from '../emoji.js';
import type { REvent } from '../event.js';
import type { REventUser } from '../eventUser.js';
import type { RGuild } from '../guild.js';
import type { RGuildCommand } from '../guildCommand.js';
import type { RIntegration } from '../integration.js';
import type { RInvite } from '../invite.js';
import type { RMember } from '../member.js';
import type { RMessage } from '../message.js';
import type { ROnboarding } from '../onboarding.js';
import type { RReaction } from '../reaction.js';
import type { RRole } from '../role.js';
import type { RSoundboardSound } from '../soundboard.js';
import type { RStageInstance } from '../stage.js';
import type { RSticker } from '../sticker.js';
import type { RThread } from '../thread.js';
import type { RThreadMember } from '../threadMember.js';
import type { RUser } from '../user.js';
import type { RVoiceState } from '../voice.js';
import type { RWebhook } from '../webhook.js';
import type { RWelcomeScreen } from '../welcomeScreen.js';

export type QueueFn = (
 addToPipeline: (pipeline: ChainableCommanderInterface) => void,
) => Promise<void>;

type GuildBasedCommand<T extends boolean> = T extends true
 ? APIApplicationCommand & { guild_id: string }
 : APIApplicationCommand;

export type DeriveRFromAPI<T, K extends boolean> = T extends APIThreadChannel & {
 guild_id: string;
 member_id: string;
}
 ? RThread
 : T extends APIGuildIntegration & {
      user_id: string;
      guild_id: string;
     }
   ? RIntegration
   : T extends APIApplicationCommand
     ? K extends true
       ? RGuildCommand
       : RCommand
     : T extends APIUser
       ? RUser
       : T extends GuildBasedCommand<K>
         ? K extends true
           ? RGuildCommand
           : RCommand
         : T extends APIGuild
           ? RGuild
           : T extends APISoundboardSound
             ? RSoundboardSound
             : T extends APIGuildChannel<RChannelTypes>
               ? RChannel
               : T extends APISticker
                 ? RSticker
                 : T extends APIStageInstance
                   ? RStageInstance
                   : T extends APIRole
                     ? RRole
                     : T extends APIVoiceState
                       ? RVoiceState
                       : T extends APIAutoModerationRule
                         ? RAutomod
                         : T extends APIBan
                           ? RBan
                           : T extends APIInvite
                             ? RInvite
                             : T extends APIGuildMember
                               ? RMember
                               : T extends APIGuildScheduledEvent
                                 ? REvent
                                 : T extends APIWebhook
                                   ? RWebhook
                                   : T extends APIEmoji
                                     ? REmoji
                                     : T extends APIThreadChannel
                                       ? RThread
                                       : T extends APIApplicationCommandPermission
                                         ? RCommandPermission
                                         : T extends APIMessage
                                           ? RMessage
                                           : T extends APIGuildIntegration
                                             ? RIntegration
                                             : T extends APIReaction
                                               ? RReaction
                                               : T extends APIThreadMember
                                                 ? RThreadMember
                                                 : T extends APIAuditLogEntry
                                                   ? RAuditLog
                                                   : T extends APIGuildWelcomeScreen
                                                     ? RWelcomeScreen
                                                     : T extends APIGuildOnboarding
                                                       ? ROnboarding
                                                       : T extends APIGuildScheduledEventUser
                                                         ? REventUser
                                                         : never;

const currentField = 'current';

export default abstract class Cache<
 T extends
  | APIUser
  | APIGuild
  | APISoundboardSound
  | GuildBasedCommand<K>
  | APISticker
  | APIStageInstance
  | APIRole
  | APIVoiceState
  | APIAutoModerationRule
  | APIBan
  | APIInvite
  | APIGuildMember
  | APIGuildScheduledEvent
  | APIEmoji
  | APIGuildChannel<RChannelTypes>
  | APIThreadChannel
  | APIApplicationCommandPermission
  | APIMessage
  | APIWebhook
  | APIGuildIntegration
  | APIReaction
  | APIThreadMember
  | APIAuditLogEntry
  | APIGuildWelcomeScreen
  | APIGuildOnboarding
  | APIGuildScheduledEventUser,
 K extends boolean = false,
> {
 abstract keys: ReadonlyArray<keyof DeriveRFromAPI<T, K>>;

 private dedupeScript = `
 local currentKey = KEYS[1]
 local historyKey = KEYS[2]
 local newValue = ARGV[1]
 local ttl = tonumber(ARGV[2])
 local timestamp = ARGV[3]
 local baseKey = ARGV[4]

 local current = redis.call('GET', currentKey)

 -- Direct byte comparison (CBOR is deterministic)
 if current == newValue then
   redis.call('EXPIRE', currentKey, ttl)
   return 0
 end

 if current then
   local previous = redis.call('HGET', historyKey, '${currentField}')
   if previous then
     local previousKey = baseKey .. ':' .. previous
     redis.call('SET', previousKey, current, 'EX', ttl)
     redis.call('HSET', historyKey, previousKey, previous)
     redis.call('HEXPIRE', historyKey, ttl, 'FIELDS', 1, previousKey)
   end
 end

 redis.call('SET', currentKey, newValue, 'EX', ttl)
 redis.call('HSET', historyKey, '${currentField}', timestamp)
 redis.call('HEXPIRE', historyKey, ttl, 'FIELDS', 1, '${currentField}')
 redis.call('EXPIRE', historyKey, ttl)
 return 1
  `;

 private prefix: string;
 private keystorePrefix: string;
 private historyPrefix: string;
 public redis: RedisWrapperInterface;
 private queueFn?: QueueFn;

 constructor(redis: RedisWrapperInterface, type: string, queueFn?: QueueFn) {
  this.prefix = `cache:${type}`;
  this.historyPrefix = `history:${type}`;
  this.keystorePrefix = `keystore:${type}`;
  this.redis = redis;
  this.queueFn = queueFn;
 }

 stringToData = (data: string | null) => (data ? deserialize<DeriveRFromAPI<T, K>>(data) : null);

 keystore(...ids: string[]) {
  return `${this.keystorePrefix}${ids.length ? `:${ids.join(':')}` : ''}`;
 }

 history(...ids: string[]) {
  return `${this.historyPrefix}${ids.length ? `:${ids.join(':')}` : ''}`;
 }

 key(...ids: string[]) {
  return `${this.prefix}${ids.length ? `:${ids.join(':')}` : ''}`;
 }

 abstract set(data: T, ...additionalArgs: string[]): Promise<boolean>;

 get(...ids: string[]): Promise<null | DeriveRFromAPI<T, K>> {
  if (ids.some((i) => i.length === 0)) return Promise.resolve(null);

  return this.redis.get(this.key(...ids, currentField)).then((data) => this.stringToData(data));
 }

 getAt(time: number, ...ids: string[]): Promise<null | DeriveRFromAPI<T, K>> {
  if (ids.some((i) => i.length === 0)) return Promise.resolve(null);

  return this.redis.get(this.key(...ids, String(time))).then((data) => {
   if (data) return this.stringToData(data);

   return this.redis
    .hget(this.history(...ids), currentField)
    .then((live) => (live !== null && Number(live) === time ? this.get(...ids) : null));
  });
 }

 getAllTimes(...ids: string[]): Promise<Array<DeriveRFromAPI<T, K>>> {
  if (ids.some((i) => i.length === 0)) return Promise.resolve([]);

  return this.getTimes(...ids).then((times) =>
   Promise.all(times.map((t) => this.getAt(Number(t), ...ids))).then((d) => d.filter((v) => !!v)),
  );
 }

 getLatest(...ids: string[]): Promise<null | DeriveRFromAPI<T, K>> {
  if (ids.some((i) => i.length === 0)) return Promise.resolve(null);

  return this.getTimes(...ids).then((times) => {
   if (!times.length) return this.get(...ids);
   return this.getAt(Math.max(...times), ...ids);
  });
 }

 private keystoreEntries(...keystoreIds: string[]): Promise<string[][]> {
  return this.redis
   .hkeys(this.keystore(...keystoreIds))
   .then((keys) => keys.map((k) => k.split(':').slice(2)));
 }

 getAll(...keystoreIds: string[]): Promise<Array<DeriveRFromAPI<T, K>>> {
  if (keystoreIds.some((i) => i.length === 0)) return Promise.resolve([]);

  return this.keystoreEntries(...keystoreIds).then((ids) =>
   Promise.all(ids.map((id) => this.get(...id))).then((d) => d.filter((v) => !!v)),
  );
 }

 getAllLatest(...keystoreIds: string[]): Promise<Array<DeriveRFromAPI<T, K>>> {
  if (keystoreIds.some((i) => i.length === 0)) return Promise.resolve([]);

  return this.keystoreEntries(...keystoreIds).then((ids) =>
   Promise.all(ids.map((id) => this.getLatest(...id))).then((d) => d.filter((v) => !!v)),
  );
 }

 getTimes(...ids: string[]): Promise<number[]> {
  if (ids.some((i) => i.length === 0)) return Promise.resolve([]);

  return this.redis.hvals(this.history(...ids)).then((times) => times.map((t) => Number(t)));
 }

 private setKeystore(
  pipeline: ChainableCommanderInterface,
  ttl: number = 604800,
  keystoreKeys: string[],
  keys: string[],
 ) {
  pipeline.hset(this.keystore(...keystoreKeys), this.key(...keys), 0);
  pipeline.expire(this.keystore(...keystoreKeys), ttl);
  pipeline.hexpire(this.keystore(...keystoreKeys), ttl, 'FIELDS', 1, this.key(...keys));
 }

 async setValue(
  value: DeriveRFromAPI<T, K>,
  keystoreIds: string[],
  ids: string[],
  ttl: number = 604800,
  pipeline?: ChainableCommanderInterface,
 ) {
  const now = Date.now();
  const valueStr = serialize(value);
  const currentKey = this.key(...ids, currentField);
  const baseKey = this.key(...ids);
  const historyKey = this.history(...ids);

  if (pipeline) {
   pipeline.eval(this.dedupeScript, 2, currentKey, historyKey, valueStr, ttl, now, baseKey);
   if (keystoreIds.length > 0) this.setKeystore(pipeline, ttl, keystoreIds, ids);
   return null;
  }

  if (this.queueFn) {
   return this.queueFn((p) => {
    p.eval(this.dedupeScript, 2, currentKey, historyKey, valueStr, ttl, now, baseKey);
    if (keystoreIds.length > 0) this.setKeystore(p, ttl, keystoreIds, ids);
   });
  }

  const p = this.redis.pipeline();
  p.eval(this.dedupeScript, 2, currentKey, historyKey, valueStr, ttl, now, baseKey);
  if (keystoreIds.length > 0) this.setKeystore(p, ttl, keystoreIds, ids);
  return p.exec();
 }

 private batchScript = `
 local keystoreKey = KEYS[1]
 local ttl = tonumber(ARGV[1])
 local timestamp = ARGV[2]
 local written = 0

 for i = 3, #ARGV, 4 do
   local currentKey = ARGV[i]
   local historyKey = ARGV[i + 1]
   local newValue = ARGV[i + 2]
   local baseKey = ARGV[i + 3]

   local current = redis.call('GET', currentKey)

   if current == newValue then
     redis.call('EXPIRE', currentKey, ttl)
   else
     if current then
       local previous = redis.call('HGET', historyKey, '${currentField}')
       if previous then
         local previousKey = baseKey .. ':' .. previous
         redis.call('SET', previousKey, current, 'EX', ttl)
         redis.call('HSET', historyKey, previousKey, previous)
         redis.call('HEXPIRE', historyKey, ttl, 'FIELDS', 1, previousKey)
       end
     end

     redis.call('SET', currentKey, newValue, 'EX', ttl)
     redis.call('HSET', historyKey, '${currentField}', timestamp)
     redis.call('HEXPIRE', historyKey, ttl, 'FIELDS', 1, '${currentField}')
     redis.call('EXPIRE', historyKey, ttl)
     written = written + 1
   end

   if keystoreKey ~= '' then
     redis.call('HSET', keystoreKey, baseKey, 0)
     redis.call('HEXPIRE', keystoreKey, ttl, 'FIELDS', 1, baseKey)
   end
 end

 if keystoreKey ~= '' then
   redis.call('EXPIRE', keystoreKey, ttl)
 end

 return written
  `;

 async setValues(
  values: Array<DeriveRFromAPI<T, K>>,
  keystoreIds: string[],
  idsOf: (value: DeriveRFromAPI<T, K>) => string[],
  ttl: number = 604800,
 ): Promise<number> {
  if (!values.length) return 0;

  const now = Date.now();
  const keystoreKey = keystoreIds.length ? this.keystore(...keystoreIds) : '';
  const args: string[] = [String(ttl), String(now)];

  for (const value of values) {
   const ids = idsOf(value);
   args.push(
    this.key(...ids, currentField),
    this.history(...ids),
    serialize(value),
    this.key(...ids),
   );
  }

  const raw = await this.redis.eval(this.batchScript, 1, keystoreKey, ...args);
  const written = Array.isArray(raw) ? raw[raw.length - 1] : raw;

  return typeof written === 'number' ? written : Number(written) || 0;
 }

 del(...ids: string[]) {
  if (ids.some((i) => i.length === 0)) return Promise.resolve(null);
  return this.redis.del(this.key(...ids, currentField));
 }

 abstract apiToR(data: T, ...additionalArgs: string[]): DeriveRFromAPI<T, K> | false;
}
