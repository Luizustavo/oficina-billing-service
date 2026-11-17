export abstract class ITransactionManager {
  abstract run<T>(fn: () => Promise<T>): Promise<T>;

  abstract afterCommit(fn: () => Promise<void> | void): void;
}
