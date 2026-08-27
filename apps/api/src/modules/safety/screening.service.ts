import { Injectable } from '@nestjs/common';
import { ScreeningReason, ScreeningResult } from './types';

/**
 * A deterministic pattern matcher, NOT a real distress-detection model.
 * CLAUDE.md is explicit that flagged content must never auto-publish and
 * must never auto-reject either — it holds for a human, and if the
 * reason involves distress language, the response carries the family's
 * real helpline numbers (hard rule #25), never a generic rejection.
 * See TRACKER.md: replacing this with anything resembling real crisis
 * detection needs clinical input, not another regex.
 */
@Injectable()
export class ScreeningService {
  private readonly patterns: Array<{ pattern: RegExp; reason: ScreeningReason }> = [
    { pattern: /\b(kill myself|end my life|ending it all|want to die|no reason to live|self[- ]harm)\b/i, reason: 'distress_language' },
    { pattern: /\b\d{10}\b/, reason: 'phone_number' },
    { pattern: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, reason: 'email_address' },
    { pattern: /\b(whatsapp|telegram|instagram id|insta id|snapchat)\b/i, reason: 'off_platform_contact_mention' },
  ];

  screenText(text: string): ScreeningResult {
    const reasons: ScreeningReason[] = [];
    for (const { pattern, reason } of this.patterns) {
      if (pattern.test(text)) reasons.push(reason);
    }
    return { flagged: reasons.length > 0, reasons };
  }

  isDistressReason(reason: ScreeningReason): boolean {
    return reason === 'distress_language';
  }
}
