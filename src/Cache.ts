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
 private workQueue: Array<() => Promise<void>> = [];
 private processingQueue = false;

 cacheDb: BunRedisWrapper;
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
  this.audits = new AuditLogCache(this.cacheDb);
  this.automods = new AutomodCache(this.cacheDb);
  this.bans = new BanCache(this.cacheDb);
  this.channels = new ChannelCache(this.cacheDb);
  this.channelStatus = new ChannelStatusCache(this.cacheDb);
  this.commands = new CommandCache(this.cacheDb);
  this.commandPermissions = new CommandPermissionCache(this.cacheDb);
  this.emojis = new EmojiCache(this.cacheDb);
  this.events = new EventCache(this.cacheDb);
  this.guilds = new GuildCache(this.cacheDb);
  this.guildCommands = new GuildCommandCache(this.cacheDb);
  this.integrations = new IntegrationCache(this.cacheDb);
  this.invites = new InviteCache(this.cacheDb);
  this.members = new MemberCache(this.cacheDb);
  this.messages = new MessageCache(this.cacheDb);
  this.reactions = new ReactionCache(this.cacheDb);
  this.roles = new RoleCache(this.cacheDb);
  this.soundboards = new SoundboardCache(this.cacheDb);
  this.stages = new StageCache(this.cacheDb);
  this.stickers = new StickerCache(this.cacheDb);
  this.threads = new ThreadCache(this.cacheDb);
  this.threadMembers = new ThreadMemberCache(this.cacheDb);
  this.users = new UserCache(this.cacheDb);
  this.voices = new VoiceCache(this.cacheDb);
  this.webhooks = new WebhookCache(this.cacheDb);
  this.pins = new PinCache(this.cacheDb);
  this.welcomeScreens = new WelcomeScreenCache(this.cacheDb);
  this.onboardings = new OnboardingCache(this.cacheDb);
  this.eventUsers = new EventUserCache(this.cacheDb);

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
  this.workQueue.push(async () => {
   const pipeline = this.cacheDb.pipeline();
   addToPipeline(pipeline);
   await pipeline.exec();
  });
  this.processQueue();
 }

 private async processQueue(): Promise<void> {
  if (this.processingQueue) return;
  this.processingQueue = true;

  while (this.workQueue.length > 0) {
   const batch = this.workQueue.splice(0, this.maxConcurrentPipelines);
   await Promise.all(
    batch.map((fn) => fn().catch((err) => logger.error('[Redis] Queue error:', err))),
   );
  }

  this.processingQueue = false;
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
