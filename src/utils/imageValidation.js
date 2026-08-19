export const MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
export const IMAGE_FORMAT_ERROR = 'Only JPG, JPEG, PNG, or WEBP images are allowed.';
export const IMAGE_SIZE_ERROR = 'Image must be 25 MB or smaller.';

function extensionFromUri(uri) {
  const clean = String(uri || '').split('?')[0];
  const match = clean.match(/\.([a-zA-Z0-9]+)$/);
  return (match?.[1] || '').toLowerCase();
}

export function isAllowedImageType({ mimeType, uri } = {}) {
  const cleanMime = String(mimeType || '').toLowerCase();
  if (cleanMime) return ALLOWED_IMAGE_MIME_TYPES.includes(cleanMime);
  return ALLOWED_IMAGE_EXTENSIONS.includes(extensionFromUri(uri));
}

// Frontend check, run right after the user picks a photo (album/files/camera).
// Picker assets usually carry fileSize + mimeType metadata already, so this
// gives an immediate error without waiting on the upload.
export function validatePickedImageAsset(asset) {
  if (!asset) return 'No image was selected.';
  if (!isAllowedImageType({ mimeType: asset.mimeType, uri: asset.uri })) return IMAGE_FORMAT_ERROR;
  const size = asset.fileSize ?? asset.size ?? null;
  if (size != null && size > MAX_IMAGE_SIZE_BYTES) return IMAGE_SIZE_ERROR;
  return null;
}

// Backend/service-layer check, run against the fetched blob right before upload
// so the limit is enforced even if picker metadata was missing or spoofed.
export function validateImageBlob(blob, uri) {
  if (!blob) return 'Unable to read the selected image.';
  if (!isAllowedImageType({ mimeType: blob.type, uri })) return IMAGE_FORMAT_ERROR;
  if (blob.size > MAX_IMAGE_SIZE_BYTES) return IMAGE_SIZE_ERROR;
  return null;
}
