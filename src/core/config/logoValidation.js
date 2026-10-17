import { MAX_LOGO_BYTES } from './defaults.js';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export class LogoValidationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'LogoValidationError';
    this.code = code;
  }
}

/** Validate both the browser-reported MIME type and the file signature. */
export async function validateLogoFile(file, { maxBytes = MAX_LOGO_BYTES } = {}) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new LogoValidationError('Choose a PNG or JPG image file.', 'INVALID_FILE');
  }
  if (file.size <= 0) {
    throw new LogoValidationError('The selected image is empty.', 'EMPTY_FILE');
  }
  if (file.size > maxBytes) {
    throw new LogoValidationError('The logo must be 2 MB or smaller.', 'FILE_TOO_LARGE');
  }
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
    throw new LogoValidationError('Only PNG and JPG files are supported.', 'UNSUPPORTED_TYPE');
  }

  let bytes;
  try {
    bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  } catch {
    throw new LogoValidationError('The image could not be read. Choose another file.', 'UNREADABLE_FILE');
  }

  const isPng = bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if ((file.type === 'image/png' && !isPng) || (file.type === 'image/jpeg' && !isJpeg)) {
    throw new LogoValidationError('The file contents do not match the selected PNG or JPG type.', 'TYPE_MISMATCH');
  }

  return file;
}
