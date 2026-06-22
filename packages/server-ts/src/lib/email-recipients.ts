const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseEmailRecipients(
  rawRecipient: unknown,
  fallbackRecipient: string,
  allowMultiple: boolean,
): string[] {
  const fallback = fallbackRecipient.trim();
  const raw = typeof rawRecipient === "string" ? rawRecipient.trim() : "";
  const value = raw || fallback;
  if (!value) return [];

  if (!allowMultiple) return [value];

  return value
    .split(/[,;\r\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function invalidEmailRecipients(recipients: readonly string[]): string[] {
  return recipients.filter((recipient) => !EMAIL_PATTERN.test(recipient));
}

export function assertValidEmailRecipients(recipients: readonly string[]): void {
  if (recipients.length === 0) {
    throw new Error("Email: recipient email is required");
  }

  const invalid = invalidEmailRecipients(recipients);
  if (invalid.length > 0) {
    throw new Error(`Email: invalid recipient ${invalid.join(", ")}`);
  }
}
