// PRC does not publish one universal fixed pattern across professions --
// this is a reasonable general shape (letters/numbers/dashes) used to
// reject obviously-malformed input, not an authoritative PRC format check.
export const PRC_LICENSE_REGEX = /^[A-Za-z0-9-]{4,10}$/;
export const INVALID_PRC_LICENSE_MESSAGE = 'Enter a valid PRC license number (4-10 letters, numbers, or dashes).';

export function isValidPrcLicense(value) {
  return PRC_LICENSE_REGEX.test(String(value || '').trim());
}
