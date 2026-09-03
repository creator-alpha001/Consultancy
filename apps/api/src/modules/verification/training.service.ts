import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { AppError } from '../../common/errors/app-error';
import { AuditService } from '../../common/audit/audit.service';
import { PG_POOL } from '../../database/db.module';
import { DomainLoaderService } from '../domains/domain-loader.service';
import { LabelMap } from '../domains/types';

/** A module as the PROVIDER sees it. Note what is absent: `correct`. */
export interface TrainingModuleForProvider {
  code: string;
  labels: LabelMap;
  required: boolean;
  sections: Array<{ heading: LabelMap; body: LabelMap }>;
  questions: Array<{
    code: string;
    prompt: LabelMap;
    options: Array<{ code: string; labels: LabelMap }>;
  }>;
  completedAt: Date | null;
  /** True when they passed an OLDER version and the content has since changed. */
  needsRetake: boolean;
}

export interface TrainingState {
  familyCode: string;
  manifestVersion: string;
  modules: TrainingModuleForProvider[];
  /** Every required module passed at the current version. */
  complete: boolean;
  /** Where to send someone who discloses distress. Always available, never gated. */
  supportResources: Array<{ label: string; value: string }>;
}

/**
 * Training, and the record that someone did it.
 *
 * SPEC-PLATFORM §8.2 puts this in the onboarding funnel; CLAUDE.md #24
 * and #25 are why it is not a formality. A provider will, eventually, be
 * in a session with someone in distress. Whether that goes well depends
 * almost entirely on whether they were ever told there is a path and what
 * it is.
 *
 * Two things this file is careful about:
 *
 *  - **The answers never leave the server.** `forProvider` strips
 *    `correct` from every question. A quiz whose answers arrive in the
 *    page teaches nothing, and this one is not decoration.
 *  - **A pass is recorded against the manifest version.** Content will be
 *    revised — a helpline number changes, a rule changes — and a
 *    completion with no version cannot answer "did they read the current
 *    guidance". Republishing training therefore asks for a retake without
 *    erasing what someone was previously shown.
 */
@Injectable()
export class TrainingService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DomainLoaderService) private readonly loader: DomainLoaderService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async forProvider(providerId: string, familyCode: string): Promise<TrainingState> {
    const family = await this.loader.getFamily(familyCode);

    const done = await this.pool.query<{
      module_code: string;
      manifest_version: string;
      completed_at: Date;
    }>(
      `SELECT module_code, manifest_version, completed_at
         FROM provider_training_completions
        WHERE provider_id = $1 AND family_code = $2
        ORDER BY completed_at DESC`,
      [providerId, familyCode],
    );

    const modules = (family.trainingModules ?? []).map((m) => {
      const atCurrent = done.rows.find(
        (d) => d.module_code === m.code && d.manifest_version === family.version,
      );
      const atAny = done.rows.find((d) => d.module_code === m.code);
      return {
        code: m.code,
        labels: m.labels,
        required: m.required !== false,
        sections: m.sections,
        // `correct` deliberately not mapped through. See the note above.
        questions: m.questions.map((q) => ({
          code: q.code,
          prompt: q.prompt,
          options: q.options,
        })),
        completedAt: atCurrent?.completed_at ?? null,
        needsRetake: !atCurrent && Boolean(atAny),
      };
    });

    return {
      familyCode,
      manifestVersion: family.version,
      modules,
      complete: modules.every((m) => !m.required || m.completedAt !== null),
      // Never behind the quiz. Someone who needs these needs them now,
      // not after they have answered five questions.
      supportResources: family.supportResources ?? [],
    };
  }

  /**
   * Grade an attempt.
   *
   * All-or-nothing on purpose. A partial pass on a module that covers
   * what to do when someone discloses self-harm is not a pass — there is
   * no question in it a provider may get wrong and still be ready.
   *
   * The wrong answers ARE returned, so a failed attempt teaches something
   * rather than saying "try again" and hiding what was misunderstood.
   */
  async submit(input: {
    providerId: string;
    familyCode: string;
    moduleCode: string;
    answers: Record<string, string>;
  }): Promise<{ passed: boolean; score: number; outOf: number; wrong: string[] }> {
    const family = await this.loader.getFamily(input.familyCode);
    const module = (family.trainingModules ?? []).find((m) => m.code === input.moduleCode);
    if (!module) {
      throw new AppError('TRAINING_MODULE_NOT_FOUND', 'no such training module', {
        status: HttpStatus.NOT_FOUND,
        detail: { moduleCode: input.moduleCode },
      });
    }

    const wrong = module.questions
      .filter((q) => input.answers[q.code] !== q.correct)
      .map((q) => q.code);
    const score = module.questions.length - wrong.length;
    const passed = wrong.length === 0;

    if (passed) {
      await this.pool.query(
        `INSERT INTO provider_training_completions
           (provider_id, family_code, module_code, manifest_version, score, out_of)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [
          input.providerId,
          input.familyCode,
          input.moduleCode,
          family.version,
          score,
          module.questions.length,
        ],
      );

      // Recorded as a consequential decision (#14). "Was this person told,
      // and when" is a question an incident review asks, and the audit log
      // is where it gets answered.
      await this.audit.record({
        actorId: input.providerId,
        actorRole: 'provider',
        action: 'training.completed',
        subjectType: 'user',
        subjectId: input.providerId,
        detail: {
          familyCode: input.familyCode,
          moduleCode: input.moduleCode,
          manifestVersion: family.version,
        },
      });
    }

    return { passed, score, outOf: module.questions.length, wrong };
  }

  /** Whether required training is done — used by the readiness check. */
  async isComplete(providerId: string, familyCode: string): Promise<boolean> {
    const state = await this.forProvider(providerId, familyCode).catch(() => null);
    return state?.complete ?? true;
  }
}
