import { OutgoingMessage } from '@domain/messaging/saga-message';

export abstract class IOutboxRepository {
  abstract add(messages: OutgoingMessage[]): Promise<void>;
}
