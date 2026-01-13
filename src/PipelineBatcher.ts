import type { ChainableCommander } from 'ioredis';

import type { Cache } from './Cache.js';
import logger from './Logger.js';

type QueuedOperation = {
 addToPipeline: (pipeline: ChainableCommander) => void;
 resolve: (result: unknown) => void;
 reject: (err: Error) => void;
};

export class PipelineBatcher {
 private pending: QueuedOperation[] = [];
 private isProcessing = false;
 private flushTimer: ReturnType<typeof setTimeout> | null = null;
 private readonly flushIntervalMs: number;
 private readonly cache: Cache;
 private readonly execTimeoutMs = 30000;

 constructor(cache: Cache, flushIntervalMs = 10) {
  this.cache = cache;
  this.flushIntervalMs = flushIntervalMs;
 }

 private getBatchSize(): number {
  const depth = this.pending.length;
  if (depth > 50000) return 25000;
  if (depth > 10000) return 10000;
  if (depth > 1000) return 5000;
  return 1000;
 }

 queue(addToPipeline: (pipeline: ChainableCommander) => void): Promise<unknown> {
  return new Promise((resolve, reject) => {
   this.pending.push({ addToPipeline, resolve, reject });
   this.scheduleFlush();
  });
 }

 private scheduleFlush(): void {
  if (this.isProcessing) return;

  const batchSize = this.getBatchSize();

  if (this.pending.length >= batchSize) {
   if (this.flushTimer) {
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
   }
   this.flush();
  } else if (!this.flushTimer) {
   this.flushTimer = setTimeout(() => {
    this.flushTimer = null;
    this.flush();
   }, this.flushIntervalMs);
  }
 }

 private execWithTimeout(
  pipeline: ChainableCommander,
 ): Promise<[error: Error | null, result: unknown][] | null> {
  return Promise.race([
   pipeline.exec(),
   new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Pipeline exec timeout after 30s')), this.execTimeoutMs);
   }),
  ]);
 }

 private async flush(): Promise<void> {
  if (this.isProcessing || this.pending.length === 0) return;

  this.isProcessing = true;
  const startDepth = this.pending.length;
  let totalProcessed = 0;
  let batchNum = 0;

  while (this.pending.length > 0) {
   const batchSize = this.getBatchSize();
   const batch = this.pending.splice(0, batchSize);
   const pipeline = this.cache.cacheDb.pipeline();
   batchNum += 1;

   try {
    batch.forEach(({ addToPipeline }) => addToPipeline(pipeline));

    if (batch.length > 100) {
     logger.log(
      `[Redis] Executing batch ${batchNum} | Size: ${batch.length} | Pending: ${this.pending.length}`,
     );
    }

    const results = await this.execWithTimeout(pipeline);
    batch.forEach(({ resolve }, i) => resolve(results?.[i]?.[1] ?? null));
    totalProcessed += batch.length;
   } catch (err) {
    logger.error('[Redis] Batch failed:', err);
    batch.forEach(({ reject }) => reject(err as Error));
   }
  }

  logger.log(
   `[Redis] Flushed ${totalProcessed} ops | Started: ${startDepth} | Remaining: ${this.pending.length}`,
  );

  this.isProcessing = false;

  if (this.pending.length > 0) this.scheduleFlush();
 }
}
