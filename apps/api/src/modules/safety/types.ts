export type ScreeningReason = 'distress_language' | 'phone_number' | 'email_address' | 'off_platform_contact_mention';

export interface ScreeningResult {
  flagged: boolean;
  reasons: ScreeningReason[];
}
