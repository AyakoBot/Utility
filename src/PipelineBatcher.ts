import type { ChainableCommander } from 'ioredis';

import type { Cache } from './Cache.js';
import logger from './Logger.js';

export class PipelineBatcher {
 private pipeline: ChainableCommander;
 private commandCount = 0;
 private flushPromise: Promise<void> | null = null;
 private flushTimer: ReturnType<typeof setTimeout> | null = null;
 private readonly cache: Cache;

 private readonly maxBatchSize = 2000;
 private readonly flushIntervalMs: number = 10;

 constructor(cache: Cache, flushIntervalMs: number = 10) {
  this.cache = cache;
  this.flushIntervalMs = flushIntervalMs;
  this.pipeline = this.cache.cacheDb.pipeline();
 }

 async queue(addToPipeline: (pipeline: ChainableCommander) => void): Promise<void> {
  while (this.commandCount >= this.maxBatchSize && this.flushPromise) {
   await this.flushPromise;
  }

  addToPipeline(this.pipeline);
  this.commandCount++;

  if (this.commandCount >= this.maxBatchSize) {
   await this.flush();
  } else {
   this.scheduleFlush();
  }
 }

 queueSync(addToPipeline: (pipeline: ChainableCommander) => void): void {
  addToPipeline(this.pipeline);
  this.commandCount++;

  if (this.commandCount >= this.maxBatchSize) {
   this.flushAsync();
  } else {
   this.scheduleFlush();
  }
 }

 private scheduleFlush(): void {
  if (this.flushTimer || this.flushPromise) return;

  this.flushTimer = setTimeout(() => {
   this.flushTimer = null;
   this.flushAsync();
  }, this.flushIntervalMs);
 }

 private flushAsync(): void {
  if (this.flushPromise || this.commandCount === 0) return;
  this.flush().catch((err) => logger.error('[Redis] Flush error:', err));
 }

 async flush(): Promise<void> {
  if (this.flushPromise) {
   return this.flushPromise;
  }

  if (this.commandCount === 0) return;

  if (this.flushTimer) {
   clearTimeout(this.flushTimer);
   this.flushTimer = null;
  }

  const pipelineToExec = this.pipeline;
  const count = this.commandCount;

  this.pipeline = this.cache.cacheDb.pipeline();
  this.commandCount = 0;

  if (count > 100) {
   logger.log(`[Redis] Flushing ${count} commands`);
  }

  this.flushPromise = pipelineToExec
   .exec()
   .then(() => {
    this.flushPromise = null;
    if (this.commandCount > 0) this.scheduleFlush();
   })
   .catch((err) => {
    this.flushPromise = null;
    if (this.commandCount > 0) this.scheduleFlush();
    throw err;
   });

  return this.flushPromise;
 }
}
