import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';

export const AssessmentErrorCode = {
  SUBMISSION_WRONG_STATUS: 'SUBMISSION_WRONG_STATUS',
  EVALUATION_NOT_FOUND: 'EVALUATION_NOT_FOUND',
  EVALUATION_ALREADY_RETURNED: 'EVALUATION_ALREADY_RETURNED',
  EVALUATION_HAS_NO_TEMPLATE: 'EVALUATION_HAS_NO_TEMPLATE',
  EVALUATION_INCOMPLETE: 'EVALUATION_INCOMPLETE',
  UNKNOWN_DIMENSION: 'UNKNOWN_DIMENSION',
} as const;

export function submissionWrongStatus(engagementId: string, status: string): AppError {
  return new AppError(
    AssessmentErrorCode.SUBMISSION_WRONG_STATUS,
    `engagement ${engagementId} is ${status}, must be working to accept a submission`,
    { status: HttpStatus.CONFLICT, detail: { engagementId, status } },
  );
}

export function evaluationNotFound(evaluationId: string): AppError {
  return new AppError(AssessmentErrorCode.EVALUATION_NOT_FOUND, `no evaluation ${evaluationId}`, {
    status: HttpStatus.NOT_FOUND,
    detail: { evaluationId },
  });
}

export function evaluationAlreadyReturned(evaluationId: string): AppError {
  return new AppError(
    AssessmentErrorCode.EVALUATION_ALREADY_RETURNED,
    `evaluation ${evaluationId} was already returned`,
    { status: HttpStatus.CONFLICT, detail: { evaluationId } },
  );
}

export function evaluationHasNoTemplate(evaluationId: string): AppError {
  return new AppError(
    AssessmentErrorCode.EVALUATION_HAS_NO_TEMPLATE,
    `evaluation ${evaluationId} has no assessment template bound — it cannot be scored`,
    { status: HttpStatus.CONFLICT, detail: { evaluationId } },
  );
}

export function evaluationIncomplete(evaluationId: string, scored: number, required: number, missing: string[]): AppError {
  return new AppError(
    AssessmentErrorCode.EVALUATION_INCOMPLETE,
    `evaluation ${evaluationId} has ${scored} of ${required} required dimensions scored`,
    { status: HttpStatus.CONFLICT, detail: { evaluationId, scored, required, missing } },
  );
}

export function unknownDimension(dimensionCode: string, evaluationId: string): AppError {
  return new AppError(
    AssessmentErrorCode.UNKNOWN_DIMENSION,
    `"${dimensionCode}" is not a dimension of the template bound to evaluation ${evaluationId}`,
    { detail: { dimensionCode, evaluationId } },
  );
}
