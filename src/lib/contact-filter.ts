/**
 * Disintermediation guard for chat (mind map §12 / technical discovery Q20).
 * A host and an artist who meet on Naada and settle over WhatsApp cost the
 * platform the whole transaction, so every message is screened for the kind
 * of thing that lets a deal jump off-platform: phone numbers, email
 * addresses, UPI IDs, @handles and named apps.
 *
 * Deliberately loose — false positives (a message that merely *mentions* a
 * number) are cheap, since the outcome is a human glancing at a flagged
 * queue, not a blocked message. Over-enforcement that makes chat hostile is
 * the bigger risk, so this never blocks sending.
 */

export interface ContactFlag {
  reason: string;
}

const PATTERNS: { reason: string; test: RegExp }[] = [
  { reason: "phone number", test: /(?:\+?\d[\d\s-]{8,}\d)/ },
  { reason: "email address", test: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i },
  { reason: "UPI ID", test: /@(ok\w*|paytm|ybl|apl|ibl|upi)\b/i },
  { reason: "social handle", test: /(?:^|\s)@[a-z0-9_.]{2,}/ },
  { reason: "mention of WhatsApp", test: /whats\s?app/i },
];

/** Returns the first pattern that matched, or null if the message reads clean. */
export function detectContactInfo(text: string): ContactFlag | null {
  for (const { reason, test } of PATTERNS) {
    if (test.test(text)) return { reason };
  }
  return null;
}
