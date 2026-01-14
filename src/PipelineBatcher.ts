import type { ChainableCommander, Redis } from 'ioredis';

import logger from './Logger.js';

export class PipelineBatcher {
 private pipeline: ChainableCommander;
 private commandCount = 0;
 private flushPromise: Promise<void> | null = null;
 private flushTimer: ReturnType<typeof setTimeout> | null = null;
 private readonly cacheDb: Redis;

 private readonly maxBatchSize = 2000;
 private readonly flushIntervalMs: number = 10;

 constructor(cacheDb: Redis, flushIntervalMs: number = 10) {
  this.cacheDb = cacheDb;
  this.flushIntervalMs = flushIntervalMs;
  this.pipeline = this.cacheDb.pipeline();
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

  this.pipeline = this.cacheDb.pipeline();
  this.commandCount = 0;

  if (count > 100) {
   logger.log(`[Redis] Flushing ${count} commands`);
  }

  this.flushPromise = pipelineToExec
   .exec()
   .then((result) => {
    if (result) {
     for (let i = 0; i < result.length; i++) {
      (result as unknown[])[i] = null;
     }
     result.length = 0;
    }
    this.flushPromise = null;
    if (this.commandCount > 0) setImmediate(() => this.scheduleFlush());
   })
   .catch((err) => {
    this.flushPromise = null;
    if (this.commandCount > 0) setImmediate(() => this.scheduleFlush());
    throw err;
   });

  return this.flushPromise;
 }
}
