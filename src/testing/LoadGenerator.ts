import { Logger } from "../utils/Logger.js";

export interface LoadPattern {
  concurrency: number;
  duration: number;
  rampUpTime: number;
}

export class LoadGenerator {
  private readonly logger: Logger;
  private isRunning: boolean = false;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  public async generateLoad<T>(
    pattern: LoadPattern,
    workerFunction: () => Promise<T>
  ): Promise<T[]> {
    this.isRunning = true;
    const results: T[] = [];
    const startTime = Date.now();
    const endTime = startTime + pattern.duration * 1000;

    this.logger.info(
      `Starting load generation: ${pattern.concurrency} concurrent workers for ${pattern.duration}s`
    );

    if (pattern.rampUpTime > 0) {
      this.logger.info(`Ramping up over ${pattern.rampUpTime}s`);
      results.push(...(await this.rampUp(pattern, workerFunction, startTime)));
    } else {
      results.push(...(await this.sustainedLoad(pattern, workerFunction, endTime)));
    }

    this.isRunning = false;
    this.logger.info(`Load generation completed. Total operations: ${results.length}`);

    return results;
  }

  public async generateIterations<T>(
    concurrency: number,
    totalIterations: number,
    workerFunction: () => Promise<T>
  ): Promise<T[]> {
    this.isRunning = true;
    const results: T[] = [];

    this.logger.info(
      `Starting iteration-based load: ${totalIterations} total iterations with ${concurrency} concurrent workers`
    );

    const iterationsPerWorker = Math.floor(totalIterations / concurrency);
    const remainder = totalIterations % concurrency;

    const workerPromises: Promise<T[]>[] = [];

    for (let i = 0; i < concurrency; i++) {
      const iterations = i < remainder ? iterationsPerWorker + 1 : iterationsPerWorker;
      workerPromises.push(this.runWorkerIterations(workerFunction, iterations));
    }

    const workerResults = await Promise.all(workerPromises);
    workerResults.forEach((wr) => results.push(...wr));

    this.isRunning = false;
    this.logger.info(`Iteration-based load completed. Total operations: ${results.length}`);

    return results;
  }

  private async rampUp<T>(
    pattern: LoadPattern,
    workerFunction: () => Promise<T>,
    startTime: number
  ): Promise<T[]> {
    const results: T[] = [];
    const rampUpEndTime = startTime + pattern.rampUpTime * 1000;
    const sustainedEndTime = startTime + pattern.duration * 1000;
    const intervalMs = (pattern.rampUpTime * 1000) / pattern.concurrency;

    let activeWorkers = 0;
    const workers: Promise<T>[] = [];

    const rampUpInterval = setInterval(() => {
      if (Date.now() >= rampUpEndTime || activeWorkers >= pattern.concurrency) {
        clearInterval(rampUpInterval);
        return;
      }

      activeWorkers++;
      this.logger.debug(`Ramping up: ${activeWorkers}/${pattern.concurrency} workers active`);

      const worker = this.runWorkerUntil(workerFunction, sustainedEndTime);
      workers.push(worker);
    }, intervalMs);

    await new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (Date.now() >= rampUpEndTime) {
          clearInterval(checkInterval);
          clearInterval(rampUpInterval);
          resolve(null);
        }
      }, 100);
    });

    this.logger.info("Ramp-up completed, sustaining load...");

    const workerResults = await Promise.all(workers);
    results.push(...workerResults);

    return results;
  }

  private async sustainedLoad<T>(
    pattern: LoadPattern,
    workerFunction: () => Promise<T>,
    endTime: number
  ): Promise<T[]> {
    const workers: Promise<T>[] = [];

    for (let i = 0; i < pattern.concurrency; i++) {
      workers.push(this.runWorkerUntil(workerFunction, endTime));
    }

    return await Promise.all(workers);
  }

  private async runWorkerUntil<T>(
    workerFunction: () => Promise<T>,
    endTime: number
  ): Promise<T> {
    let lastResult: T | undefined;

    while (Date.now() < endTime && this.isRunning) {
      try {
        lastResult = await workerFunction();
      } catch (error) {
        this.logger.debug("Worker error", { error: (error as Error).message });
      }
    }

    return lastResult!;
  }

  private async runWorkerIterations<T>(
    workerFunction: () => Promise<T>,
    iterations: number
  ): Promise<T[]> {
    const results: T[] = [];

    for (let i = 0; i < iterations; i++) {
      try {
        const result = await workerFunction();
        results.push(result);
      } catch (error) {
        this.logger.debug("Worker iteration error", { error: (error as Error).message });
      }
    }

    return results;
  }

  public stop(): void {
    this.isRunning = false;
    this.logger.info("Load generation stopped");
  }

  public isActive(): boolean {
    return this.isRunning;
  }
}
