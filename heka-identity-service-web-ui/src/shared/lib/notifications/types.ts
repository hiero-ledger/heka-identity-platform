/**
 * The part of the identity service's notification DTOs the UI reads. DIDComm events carry the
 * exchange record id as `id`; OpenID4VC events carry the whole session record.
 */
export interface NotificationMessage {
  type: string;
  id?: string;
  state?: string;
  issuanceSession?: { id: string; state?: string };
  verificationSession?: { id: string; state?: string };
}

export type NotificationStatus = 'closed' | 'connecting' | 'open';

export const getNotificationRecordId = (
  message: NotificationMessage,
): string | undefined =>
  message.id ?? message.issuanceSession?.id ?? message.verificationSession?.id;

export const isNotificationMessage = (
  value: unknown,
): value is NotificationMessage =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { type?: unknown }).type === 'string';
