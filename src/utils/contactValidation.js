export const PH_MOBILE_REGEX = /^(09\d{9}|\+639\d{9})$/;
export const PH_MOBILE_FORMAT_ERROR = 'Enter a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX).';

export function isValidPhMobile(value) {
  return PH_MOBILE_REGEX.test(String(value || '').trim());
}
