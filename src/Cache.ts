import { EventEmitter } from 'node:events';

import { GatewayDispatchEvents } from '@discordjs/core';

import BunRedisWrapper, { type BunChainableCommander } from './BunRedis.js';
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
import { MessageType } from './Types/Redis.js';

const messageTypes = [MessageType.Interaction, MessageType.Vote, MessageType.Appeal];

export class Cache extends EventEmitter {
 readonly prefix = 'cache';
 readonly cacheDbNum: number;
 readonly schedDbNum: number;

 private pipelineInFlight = 0;
 private readonly maxConcurrentPipelines = 10;
 private pipelineQueue: Array<() => void> = [];
 private pendingCommands: Array<(p: BunChainableCommander) => void> = [];
 private flushTimer: ReturnType<typeof setTimeout> | null = null;
 private flushing = false;

 cacheDb: BunRedisWrapper;
 readonly cachePub: BunRedisWrapper;
 readonly cacheSub: BunRedisWrapper;
 readonly scheduleDb: BunRedisWrapper | null;
 readonly scheduleSub: BunRedisWrapper | null;

 constructor(cacheDbNum: number, schedDbNum?: number, sub: boolean = true) {
  if (sub && !schedDbNum) throw new Error('[Cache] schedDbNum must be provided if sub is true');

  super();

  logger.debug('[Cache] Initializing cache with cacheDb:', cacheDbNum, 'schedDb:', schedDbNum);

  this.cacheDbNum = cacheDbNum;
  this.schedDbNum = schedDbNum || -1;

  logger.silly('[Cache] Creating Redis connections...');
  const host = process.argv.includes('--local') ? '127.0.0.1' : 'redis';
  logger.log('[Cache] Using Redis host:', host);

  const redisOptions = { host, db: cacheDbNum };
  this.cacheDb = new BunRedisWrapper(redisOptions);
  this.cachePub = new BunRedisWrapper(redisOptions);
  this.cacheSub = new BunRedisWrapper(redisOptions);

  if (schedDbNum) {
   const schedOptions = { host, db: schedDbNum };
   this.scheduleDb = new BunRedisWrapper(schedOptions);
   this.scheduleSub = new BunRedisWrapper(schedOptions);
  } else {
   this.scheduleDb = null;
   this.scheduleSub = null;
  }

  logger.log('[Cache] Redis connections established. Subscribing to events:', sub);
  if (sub) this._sub();

  logger.silly('[Cache] Initializing cache classes...');
  const q = this.queueSync.bind(this);
  this.audits = new AuditLogCache(this.cacheDb, q);
  this.automods = new AutomodCache(this.cacheDb, q);
  this.bans = new BanCache(this.cacheDb, q);
  this.channels = new ChannelCache(this.cacheDb, q);
  this.channelStatus = new ChannelStatusCache(this.cacheDb);
  this.commands = new CommandCache(this.cacheDb, q);
  this.commandPermissions = new CommandPermissionCache(this.cacheDb, q);
  this.emojis = new EmojiCache(this.cacheDb, q);
  this.events = new EventCache(this.cacheDb, q);
  this.guilds = new GuildCache(this.cacheDb, q);
  this.guildCommands = new GuildCommandCache(this.cacheDb, q);
  this.integrations = new IntegrationCache(this.cacheDb, q);
  this.invites = new InviteCache(this.cacheDb, q);
  this.members = new MemberCache(this.cacheDb, q);
  this.messages = new MessageCache(this.cacheDb, q);
  this.reactions = new ReactionCache(this.cacheDb, q);
  this.roles = new RoleCache(this.cacheDb, q);
  this.soundboards = new SoundboardCache(this.cacheDb, q);
  this.stages = new StageCache(this.cacheDb, q);
  this.stickers = new StickerCache(this.cacheDb, q);
  this.threads = new ThreadCache(this.cacheDb, q);
  this.threadMembers = new ThreadMemberCache(this.cacheDb, q);
  this.users = new UserCache(this.cacheDb, q);
  this.voices = new VoiceCache(this.cacheDb, q);
  this.webhooks = new WebhookCache(this.cacheDb, q);
  this.pins = new PinCache(this.cacheDb);
  this.welcomeScreens = new WelcomeScreenCache(this.cacheDb, q);
  this.onboardings = new OnboardingCache(this.cacheDb, q);
  this.eventUsers = new EventUserCache(this.cacheDb, q);

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
  this.scheduleDb?.config('SET', 'notify-keyspace-events', 'Ex');

  logger.debug('[Cache] Subscribing to Redis channels');
  this.cacheSub.subscribe(
   `__keyevent@${this.schedDbNum}__:expired`,
   ...Object.values(GatewayDispatchEvents),
   ...messageTypes,
  );
  this.scheduleSub?.subscribe(`__keyevent@${this.schedDbNum}__:expired`);
 };

 queueSync(addToPipeline: (pipeline: BunChainableCommander) => void): void {
  this.pendingCommands.push(addToPipeline);

  if (!this.flushTimer && !this.flushing) {
   this.flushTimer = setTimeout(() => this.flushPendingCommands(), 10);
  }

  if (this.pendingCommands.length % 1000 === 0) {
   logger.log(`[Cache] Pending commands: ${this.pendingCommands.length}`);
  }
 }

 private async flushPendingCommands(): Promise<void> {
  this.flushTimer = null;

  if (this.flushing) return;
  this.flushing = true;

  try {
   while (this.pendingCommands.length > 0) {
    const commands = this.pendingCommands;
    this.pendingCommands = [];

    if (process.argv.includes('--debug')) {
     logger.log(`[Cache] Flushing ${commands.length} commands in single pipeline`);
    }

    const pipeline = this.cacheDb.pipeline();
    for (const addCmd of commands) {
     addCmd(pipeline);
    }

    const startTime = Date.now();
    try {
     await pipeline.exec();
     if (commands.length > 100 || process.argv.includes('--debug')) {
      logger.log(
       `[Cache] Flush complete: ${commands.length} commands in ${Date.now() - startTime}ms`,
      );
     }
    } catch (err) {
     logger.error('[Redis] Flush error:', err);
    }
   }
  } finally {
   this.flushing = false;
   if (this.pendingCommands.length > 0) {
    this.flushTimer = setTimeout(() => this.flushPendingCommands(), 10);
   }
  }
 }

 async execPipeline<T>(buildPipeline: (pipeline: BunChainableCommander) => void): Promise<T> {
  if (this.pipelineInFlight >= this.maxConcurrentPipelines) {
   await new Promise<void>((resolve) => this.pipelineQueue.push(resolve));
  }

  this.pipelineInFlight++;
  const pipeline = this.cacheDb.pipeline();
  buildPipeline(pipeline);

  try {
   const result = await pipeline.exec();
   if (!result) return [] as T;

   const values: unknown[] = [];
   for (let i = 0; i < result.length; i++) {
    values.push(result[i][1]);
   }
   return values as T;
  } finally {
   this.pipelineInFlight--;
   if (this.pipelineQueue.length > 0) {
    const next = this.pipelineQueue.shift();
    if (next) process.nextTick(next);
   }
  }
 }
}
