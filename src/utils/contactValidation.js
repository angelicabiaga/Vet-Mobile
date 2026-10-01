export const PH_MOBILE_REGEX = /^(09\d{9}|\+639\d{9})$/;
export const PH_MOBILE_FORMAT_ERROR = 'Enter a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX).';

// Registration: exactly 11 digits, starting with 09.
export const REGISTER_CONTACT_REGEX = /^09\d{9}$/;
export const CONTACT_REQUIRED_ERROR = 'Contact number is required.';
export const CONTACT_FORMAT_ERROR = 'Enter a valid 11-digit contact number.';
export const CONTACT_TAKEN_ERROR = 'Contact number is already registered.';

export function isValidPhMobile(value) {
  return PH_MOBILE_REGEX.test(String(value || '').trim());
}

export function isValidRegisterContact(value) {
  return REGISTER_CONTACT_REGEX.test(String(value || ''));
}

// Both stored forms of the same number (09XXXXXXXXX and +639XXXXXXXXX), for duplicate lookups.
export function phoneVariants(value) {
  const phone = String(value || '').trim();
  if (/^09\d{9}$/.test(phone)) return [phone, `+63${phone.slice(1)}`];
  if (/^\+639\d{9}$/.test(phone)) return [phone, `0${phone.slice(3)}`];
  return [phone];
}

// Unique-violation raised by the profiles_phone_unique index (see SUPABASE_UNIQUE_CONTACT_NUMBER.sql).
export function isDuplicatePhoneError(error) {
  return error?.code === '23505' && /phone/i.test(`${error.message || ''} ${error.details || ''}`);
}
