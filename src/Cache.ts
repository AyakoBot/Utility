import { EventEmitter } from 'node:events';

import { GatewayDispatchEvents } from '@discordjs/core';
import Redis from 'ioredis';

import AuditLogCache from './CacheClasses/auditlog.js';
import AutomodCache from './CacheClasses/automod.js';
import BanCache from './CacheClasses/ban.js';
import ChannelCache from './CacheClasses/channel.js';
import ChannelStatusCache from './CacheClasses/channelStatus.js';
import CommandCache from './CacheClasses/command.js';
import CommandPermissionCache from './CacheClasses/commandPermission.js';
import EmojiCache from './CacheClasses/emoji.js';
import EventCache from './CacheClasses/event.js';
import EventUserCache from './CacheClasses/eventUser.js';
import GuildCache from './CacheClasses/guild.js';
import GuildCommandCache from './CacheClasses/guildCommand.js';
import IntegrationCache from './CacheClasses/integration.js';
import InviteCache from './CacheClasses/invite.js';
import MemberCache from './CacheClasses/member.js';
import MessageCache from './CacheClasses/message.js';
import OnboardingCache from './CacheClasses/onboarding.js';
import PinCache from './CacheClasses/pin.js';
import ReactionCache from './CacheClasses/reaction.js';
import RoleCache from './CacheClasses/role.js';
import SoundboardCache from './CacheClasses/soundboard.js';
import StageCache from './CacheClasses/stage.js';
import StickerCache from './CacheClasses/sticker.js';
import ThreadCache from './CacheClasses/thread.js';
import ThreadMemberCache from './CacheClasses/threadMember.js';
import UserCache from './CacheClasses/user.js';
import VoiceCache from './CacheClasses/voice.js';
import WebhookCache from './CacheClasses/webhook.js';
import WelcomeScreenCache from './CacheClasses/welcomeScreen.js';
import logger from './Logger.js';
import { PipelineBatcher } from './PipelineBatcher.js';
import { MessageType } from './Types/Redis.js';

const messageTypes = [MessageType.Interaction, MessageType.Vote, MessageType.Appeal];

export class Cache extends EventEmitter {
 readonly prefix = 'cache';
 readonly cacheDbNum: number;
 readonly schedDbNum: number;
 readonly batcher: PipelineBatcher;

 readonly cacheDb: Redis;
 readonly cacheSub: Redis;
 readonly scheduleDb: Redis | null;
 readonly scheduleSub: Redis | null;

 constructor(cacheDbNum: number, schedDbNum?: number, sub: boolean = true) {
  if (sub && !schedDbNum) throw new Error('[Cache] schedDbNum must be provided if sub is true');

  super();

  logger.debug('[Cache] Initializing cache with cacheDb:', cacheDbNum, 'schedDb:', schedDbNum);

  this.cacheDbNum = cacheDbNum;
  this.schedDbNum = schedDbNum || -1;

  logger.silly('[Cache] Creating Redis connections...');
  const host = process.argv.includes('--local') ? '127.0.0.1' : 'redis';
  logger.log('[Cache] Using Redis host:', host);

  this.cacheDb = new Redis({ host, db: cacheDbNum });
  this.cacheSub = new Redis({ host, db: cacheDbNum });
  this.batcher = new PipelineBatcher(this);

  if (schedDbNum) {
   this.scheduleDb = new Redis({ host, db: schedDbNum });
   this.scheduleSub = new Redis({ host, db: schedDbNum });
  } else {
   this.scheduleDb = null;
   this.scheduleSub = null;
  }

  logger.log('[Cache] Redis connections established. Subscribing to events:', sub);
  if (sub) this._sub();

  logger.silly('[Cache] Initializing cache classes...');
  this.audits = new AuditLogCache(this.cacheDb, this.batcher);
  this.automods = new AutomodCache(this.cacheDb, this.batcher);
  this.bans = new BanCache(this.cacheDb, this.batcher);
  this.channels = new ChannelCache(this.cacheDb, this.batcher);
  this.channelStatus = new ChannelStatusCache(this.cacheDb);
  this.commands = new CommandCache(this.cacheDb, this.batcher);
  this.commandPermissions = new CommandPermissionCache(this.cacheDb, this.batcher);
  this.emojis = new EmojiCache(this.cacheDb, this.batcher);
  this.events = new EventCache(this.cacheDb, this.batcher);
  this.guilds = new GuildCache(this.cacheDb, this.batcher);
  this.guildCommands = new GuildCommandCache(this.cacheDb, this.batcher);
  this.integrations = new IntegrationCache(this.cacheDb, this.batcher);
  this.invites = new InviteCache(this.cacheDb, this.batcher);
  this.members = new MemberCache(this.cacheDb, this.batcher);
  this.messages = new MessageCache(this.cacheDb, this.batcher);
  this.reactions = new ReactionCache(this.cacheDb, this.batcher);
  this.roles = new RoleCache(this.cacheDb, this.batcher);
  this.soundboards = new SoundboardCache(this.cacheDb, this.batcher);
  this.stages = new StageCache(this.cacheDb, this.batcher);
  this.stickers = new StickerCache(this.cacheDb, this.batcher);
  this.threads = new ThreadCache(this.cacheDb, this.batcher);
  this.threadMembers = new ThreadMemberCache(this.cacheDb, this.batcher);
  this.users = new UserCache(this.cacheDb, this.batcher);
  this.voices = new VoiceCache(this.cacheDb, this.batcher);
  this.webhooks = new WebhookCache(this.cacheDb, this.batcher);
  this.pins = new PinCache(this.cacheDb);
  this.welcomeScreens = new WelcomeScreenCache(this.cacheDb, this.batcher);
  this.onboardings = new OnboardingCache(this.cacheDb, this.batcher);
  this.eventUsers = new EventUserCache(this.cacheDb, this.batcher);

  this.cacheSub.on('message', this.callback);
  this.scheduleSub?.on('message', this.callback);

  logger.log('[Cache] Cache initialization complete');
 }

 readonly audits: AuditLogCache;
 readonly automods: AutomodCache;
 readonly bans: BanCache;
 readonly channels: ChannelCache;
 readonly channelStatus: ChannelStatusCache;
 readonly commands: CommandCache;
 readonly commandPermissions: CommandPermissionCache;
 readonly emojis: EmojiCache;
 readonly events: EventCache;
 readonly guilds: GuildCache;
 readonly guildCommands: GuildCommandCache;
 readonly integrations: IntegrationCache;
 readonly invites: InviteCache;
 readonly members: MemberCache;
 readonly messages: MessageCache;
 readonly reactions: ReactionCache;
 readonly roles: RoleCache;
 readonly soundboards: SoundboardCache;
 readonly stages: StageCache;
 readonly stickers: StickerCache;
 readonly threads: ThreadCache;
 readonly threadMembers: ThreadMemberCache;
 readonly users: UserCache;
 readonly voices: VoiceCache;
 readonly webhooks: WebhookCache;
 readonly pins: PinCache;
 readonly welcomeScreens: WelcomeScreenCache;
 readonly onboardings: OnboardingCache;
 readonly eventUsers: EventUserCache;

 private _sub = () => {
  logger.silly('[Cache] Configuring Redis keyspace notifications');
  this.cacheDb.config('SET', 'notify-keyspace-events', 'Ex');
  this.scheduleDb!.config('SET', 'notify-keyspace-events', 'Ex');

  logger.debug('[Cache] Subscribing to Redis channels');
  this.cacheSub.subscribe(
   `__keyevent@${this.schedDbNum}__:expired`,
   ...Object.values(GatewayDispatchEvents),
   ...messageTypes,
  );
  this.scheduleSub!.subscribe(`__keyevent@${this.schedDbNum}__:expired`);
 };

 private callback = async (channel: string, key: string) => {
  logger.silly('[Cache] Received message on channel:', channel);

  if (
   messageTypes.includes(channel as MessageType) ||
   Object.values(GatewayDispatchEvents).includes(channel as GatewayDispatchEvents)
  ) {
   const eventName = Object.entries(GatewayDispatchEvents).find(([, val]) => val === channel)?.[1];
   if (!eventName) {
    logger.debug('[Cache] No event name found for channel:', channel);
    return;
   }

   let data = key ? JSON.parse(key) : null;
   if (typeof data === 'string') data = JSON.parse(data);

   if (!key.includes('669893888856817665')) return; // TODO disable dev filter

   logger.silly('[Cache] Emitting event:', eventName);
   logger.silly('[Cache] Event data:', data);
   this.emit(eventName, data);
  }

  if (
   channel !== `__keyevent@${this.scheduleDb!.options.db}__:expired` &&
   channel !== `__keyevent@${this.cacheDb.options.db}__:expired`
  ) {
   return;
  }

  if (key.includes('scheduled-data:')) return;

  const keyArgs = key.split(/:/g).splice(0, 3);
  const eventName = keyArgs.filter((k) => Number.isNaN(+k)).join('/');

  logger.debug('[Cache] Key expired:', key, '-> event:', eventName);

  const dataKey = key.replace('scheduled:', 'scheduled-data:');
  const [dbNum] = channel.split('@')[1].split(':');
  const db = dbNum === String(this.cacheDbNum) ? this.cacheDb : this.scheduleDb!;

  const value = await db.get(dataKey);
  db.expire(dataKey, 10);

  logger.silly('[Cache] Emitting expire event for:', eventName);
  this.emit('expire', { eventName, value: value ? JSON.parse(value) : null });
 };
}
