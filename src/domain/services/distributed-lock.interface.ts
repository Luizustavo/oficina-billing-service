export abstract class IDistributedLock {
  abstract run<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T>;
}
