export abstract class IIdempotencyStore {
  abstract seen(key: string): Promise<boolean>;
  abstract remember(key: string, ttlSeconds: number): Promise<void>;
}
