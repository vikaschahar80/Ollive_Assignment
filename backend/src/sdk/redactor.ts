/**
 * Lightweight and high-performance PII Redactor
 * Automatically sanitizes strings by masking sensitive information using regex.
 */

// Matches standard email format: user@domain.com
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Matches US SSN format: XXX-XX-XXXX
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;

// Matches common Credit Card patterns (13 to 19 digits, spaced or hyphenated)
const CREDIT_CARD_REGEX = /\b(?:\d[ -]*?){13,19}\b/g;

// Matches international and domestic phone numbers: +1 (555) 019-2834 or 555-019-2834
const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

/**
 * Checks if a string contains any PII that warrants redacting
 */
export function containsPII(text: string): boolean {
  if (!text) return false;
  return (
    EMAIL_REGEX.test(text) ||
    SSN_REGEX.test(text) ||
    CREDIT_CARD_REGEX.test(text) ||
    PHONE_REGEX.test(text)
  );
}

/**
 * Redacts PII from text and returns the redacted string and a boolean flag indicating if changes were made.
 */
export function redactPII(text: string): { redactedText: string; hasChanges: boolean } {
  if (!text) return { redactedText: text, hasChanges: false };

  let currentText = text;
  let hasChanges = false;

  // Reset regex indices
  EMAIL_REGEX.lastIndex = 0;
  SSN_REGEX.lastIndex = 0;
  CREDIT_CARD_REGEX.lastIndex = 0;
  PHONE_REGEX.lastIndex = 0;

  // 1. Redact Emails
  if (EMAIL_REGEX.test(currentText)) {
    currentText = currentText.replace(EMAIL_REGEX, '[REDACTED_EMAIL]');
    hasChanges = true;
  }

  // 2. Redact SSNs
  if (SSN_REGEX.test(currentText)) {
    currentText = currentText.replace(SSN_REGEX, '[REDACTED_SSN]');
    hasChanges = true;
  }

  // 3. Redact Credit Cards (verify it looks like a valid digit card block, not just a random long string of numbers)
  if (CREDIT_CARD_REGEX.test(currentText)) {
    currentText = currentText.replace(CREDIT_CARD_REGEX, (match) => {
      // Stripped of symbols, must have length between 13 and 19
      const digits = match.replace(/[- ]/g, '');
      if (digits.length >= 13 && digits.length <= 19) {
        return '[REDACTED_CREDIT_CARD]';
      }
      return match;
    });
    hasChanges = true;
  }

  // 4. Redact Phone Numbers
  if (PHONE_REGEX.test(currentText)) {
    currentText = currentText.replace(PHONE_REGEX, '[REDACTED_PHONE]');
    hasChanges = true;
  }

  return {
    redactedText: currentText,
    hasChanges
  };
}
