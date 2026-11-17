import { IMessagePublisher } from '@domain/services/message-publisher.interface';
import { SagaMessageHandlerRegistry } from './saga-message-handler.registry';
import { RabbitMqMessagePublisher } from './rabbitmq-message-publisher';
import { BillingCommandsConsumer } from './billing-commands.consumer';
import { RabbitMqConnection } from './rabbitmq-connection.service';
import { OutboxRelayService } from './outbox-relay.service';
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
  providers: [
    RabbitMqConnection,
    RabbitMqMessagePublisher,
    { provide: IMessagePublisher, useExisting: RabbitMqMessagePublisher },
    SagaMessageHandlerRegistry,
    OutboxRelayService,
    BillingCommandsConsumer,
  ],
  exports: [IMessagePublisher, SagaMessageHandlerRegistry],
})
export class MessagingModule {}
