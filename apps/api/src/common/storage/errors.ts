import { HttpStatus } from '@nestjs/common';
import { AppError } from '../errors/app-error';

export const AttachmentErrorCode = {
  ATTACHMENT_NOT_FOUND: 'ATTACHMENT_NOT_FOUND',
  ATTACHMENT_ACCESS_DENIED: 'ATTACHMENT_ACCESS_DENIED',
  ATTACHMENT_LINK_INVALID: 'ATTACHMENT_LINK_INVALID',
  ATTACHMENT_LINK_EXPIRED: 'ATTACHMENT_LINK_EXPIRED',
  ATTACHMENT_TOO_LARGE: 'ATTACHMENT_TOO_LARGE',
  ATTACHMENT_TYPE_NOT_ALLOWED: 'ATTACHMENT_TYPE_NOT_ALLOWED',
  ATTACHMENT_GRANT_TO_OWNER: 'ATTACHMENT_GRANT_TO_OWNER',
} as const;

export function attachmentNotFound(id: string): AppError {
  return new AppError(AttachmentErrorCode.ATTACHMENT_NOT_FOUND, `no attachment ${id}`, {
    status: HttpStatus.NOT_FOUND,
    detail: { id },
  });
}

/**
 * Deliberately identical in shape to "not found", and 404 rather than
 * 403: telling someone a document exists but is not theirs to see is
 * itself a disclosure — it confirms that a particular person submitted a
 * particular thing.
 */
export function attachmentAccessDenied(id: string): AppError {
  return new AppError(AttachmentErrorCode.ATTACHMENT_NOT_FOUND, `no attachment ${id}`, {
    status: HttpStatus.NOT_FOUND,
    detail: { id },
  });
}

export function attachmentLinkInvalid(): AppError {
  return new AppError(AttachmentErrorCode.ATTACHMENT_LINK_INVALID, 'this link is not valid', {
    status: HttpStatus.FORBIDDEN,
  });
}

export function attachmentLinkExpired(): AppError {
  return new AppError(
    AttachmentErrorCode.ATTACHMENT_LINK_EXPIRED,
    'this link has expired — open the document again to get a fresh one',
    { status: HttpStatus.FORBIDDEN },
  );
}

export function attachmentTooLarge(bytes: number, limit: number): AppError {
  return new AppError(AttachmentErrorCode.ATTACHMENT_TOO_LARGE, `file is larger than the ${limit}-byte limit`, {
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    detail: { bytes, limit },
  });
}

export function attachmentTypeNotAllowed(contentType: string, allowed: string[]): AppError {
  return new AppError(
    AttachmentErrorCode.ATTACHMENT_TYPE_NOT_ALLOWED,
    `${contentType} cannot be uploaded here`,
    { status: HttpStatus.BAD_REQUEST, detail: { contentType, allowed } },
  );
}

export function attachmentGrantToOwner(): AppError {
  return new AppError(
    AttachmentErrorCode.ATTACHMENT_GRANT_TO_OWNER,
    'the owner already has access — no grant is needed',
    { status: HttpStatus.BAD_REQUEST },
  );
}
