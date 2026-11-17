import { PaymentFailureReason } from '@domain/enums/payment.enum';

export type NotificationAction =
  | { kind: 'confirm' }
  | { kind: 'fail'; reason: PaymentFailureReason }
  | { kind: 'ignore' };

/** Status de https://www.mercadopago.com.br/developers (Payments API). */
export function actionForMercadoPagoStatus(status: string): NotificationAction {
  switch (status) {
    case 'approved':
      return { kind: 'confirm' };
    case 'rejected':
      return { kind: 'fail', reason: 'REJECTED' };
    case 'cancelled':
      return { kind: 'fail', reason: 'CANCELLED' };
    default:
      return { kind: 'ignore' };
  }
}
