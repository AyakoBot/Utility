/* eslint-disable @typescript-eslint/naming-convention */
import type { APIMessage } from 'discord-api-types/v10';

import type { RedisWrapperInterface } from '../RedisWrapper.js';

import Cache, { type QueueFn } from './Base/Cache.js';
import MessageCache, { type RMessage, RMessageKeys } from './message.js';

export type RInteractionMessage = RMessage & {
 interaction_token: string;
 application_id: string;
};

export const RInteractionMessageKeys = [
 ...RMessageKeys,
 'interaction_token',
 'application_id',
] as const;

export default class InteractionMessageCache extends Cache<APIMessage> {
 public keys = RInteractionMessageKeys as unknown as typeof RMessageKeys;

 constructor(redis: RedisWrapperInterface, queueFn?: QueueFn) {
  super(redis, 'interactions', queueFn);
 }

 async set() {
  return Promise.reject(
   new Error('Cannot set interaction messages in cache. Convert with apiToR instead.'),
  );
 }

 async get() {
  return Promise.reject(
   new Error('Cannot get interaction messages from cache. Convert with apiToR instead.'),
  );
 }

 apiToR(
  data: APIMessage,
  guildId: string | '@me',
  applicationId: string,
  interactionToken: string,
 ) {
  const rData = new MessageCache(this.redis).apiToR(
   data,
   guildId,
  ) as RInteractionMessage;

  rData.is_message = false;
  rData.application_id = applicationId;
  rData.interaction_token = interactionToken;

  return rData;
 }
}
