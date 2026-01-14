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

 private static globalInFlight = 0;
 private static readonly maxGlobalInFlight = 10000;
 private static waitQueue: Array<() => void> = [];
 private static readonly maxWaitQueue = 5000;

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

 async queueSync(addToPipeline: (pipeline: ChainableCommander) => void): Promise<boolean> {
  if (PipelineBatcher.globalInFlight >= PipelineBatcher.maxGlobalInFlight) {
   if (PipelineBatcher.waitQueue.length >= PipelineBatcher.maxWaitQueue) {
    logger.warn('[Redis] Backpressure: dropping command, queue full:', PipelineBatcher.waitQueue.length);
    return false;
   }
   await new Promise<void>((resolve) => PipelineBatcher.waitQueue.push(resolve));
  }

  addToPipeline(this.pipeline);
  this.commandCount++;

  if (this.commandCount >= this.maxBatchSize) {
   this.flushAsync();
  } else {
   this.scheduleFlush();
  }
  return true;
 }

 private scheduleFlush(): void {
  if (this.flushTimer || this.flushPromise) return;

  this.flushTimer = setTimeout(() => {
   this.flushTimer = null;
   this.flushAsync();
  }, this.flushIntervalMs);
 }

 private static drainWaitQueue(): void {
  while (
   PipelineBatcher.waitQueue.length > 0 &&
   PipelineBatcher.globalInFlight < PipelineBatcher.maxGlobalInFlight
  ) {
   const next = PipelineBatcher.waitQueue.shift();
   if (next) next();
  }
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

  PipelineBatcher.globalInFlight += count;

  if (count > 100) {
   logger.log(`[Redis] Flushing ${count} commands (in-flight: ${PipelineBatcher.globalInFlight})`);
  }

  this.flushPromise = pipelineToExec
   .exec()
   .then((result) => {
    PipelineBatcher.globalInFlight -= count;
    PipelineBatcher.drainWaitQueue();

    if (result) {
     for (let i = 0; i < result.length; i++) {
      (result as unknown[])[i] = null;
     }
     result.length = 0;
    }
    this.flushPromise = null;
    if (this.commandCount > 0) process.nextTick(() => this.scheduleFlush());
   })
   .catch((err) => {
    PipelineBatcher.globalInFlight -= count;
    PipelineBatcher.drainWaitQueue();
    this.flushPromise = null;
    if (this.commandCount > 0) process.nextTick(() => this.scheduleFlush());
    throw err;
   });

  return this.flushPromise;
 }
}
