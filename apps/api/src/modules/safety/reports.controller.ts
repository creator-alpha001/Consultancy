import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { CurrentActor, Public, Roles } from '../identity/auth.guard';
import { Actor } from '../identity/types';
import { DomainLoaderService } from '../domains/domain-loader.service';
import { ReportService } from './report.service';
import { RaiseReportResult, ReportForReporter, ReportRow, ReportSubjectType } from './types';

const SUBJECT_TYPES: ReadonlySet<string> = new Set([
  'user',
  'question',
  'answer',
  'review',
  'session',
  'engagement',
]);

/**
 * Reporting over HTTP.
 *
 * The reporter is always the authenticated actor and never a body field
 * (#28), and no route here returns a reporter's identity to anyone but
 * an admin — a report button that tells the reported party who pressed
 * it is a retaliation tool.
 */
@Controller()
export class ReportsController {
  constructor(
    @Inject(ReportService) private readonly reports: ReportService,
    @Inject(DomainLoaderService) private readonly loader: DomainLoaderService,
  ) {}

  /**
   * The reasons this domain's family accepts, for the picker.
   *
   * Comes from the pack, so core never names one and the client never
   * hardcodes a list that a second family would contradict.
   *
   * Public, like the rest of the catalogue: knowing what can be reported
   * is not privileged, and gating it meant a signed-out page rendered
   * the report control with no reasons in it — a control that silently
   * does nothing is worse than no control.
   */
  @Get('report-reasons')
  @Public()
  async reasons(
    @Query('domainCode') domainCode: string,
  ): Promise<Array<{ code: string; labels: Record<string, string>; isWelfareConcern: boolean }>> {
    if (!domainCode) throw new BadRequestException('domainCode is required');
    const domain = await this.loader.getDomain(domainCode);
    return domain.family.reportReasons.map((r) => ({
      code: r.code,
      labels: r.labels,
      isWelfareConcern: r.isWelfareConcern === true,
    }));
  }

  @Post('reports')
  async raise(
    @CurrentActor() actor: Actor,
    @Body()
    body: {
      subjectType?: string;
      subjectId?: string;
      reasonCode?: string;
      detailOriginal?: string;
      detailLang?: string;
      domainCode?: string;
    },
  ): Promise<RaiseReportResult> {
    if (!body.subjectType || !SUBJECT_TYPES.has(body.subjectType)) {
      throw new BadRequestException(`subjectType must be one of: ${[...SUBJECT_TYPES].join(', ')}`);
    }
    if (!body.subjectId) throw new BadRequestException('subjectId is required');
    if (!body.reasonCode) throw new BadRequestException('reasonCode is required');

    return this.reports.raise({
      reporterId: actor.userId,
      subjectType: body.subjectType as ReportSubjectType,
      subjectId: body.subjectId,
      reasonCode: body.reasonCode,
      detailOriginal: body.detailOriginal,
      detailLang: body.detailLang,
      domainCode: body.domainCode,
    });
  }

  /** The caller's own reports. Acknowledged, outcome withheld — see `ReportForReporter`. */
  @Get('reports/mine')
  async mine(@CurrentActor() actor: Actor): Promise<ReportForReporter[]> {
    return this.reports.listForReporter(actor.userId);
  }

  // ── Reviewer queue ──────────────────────────────────────────────────

  @Get('admin/reports')
  @Roles('admin')
  async queue(@Query('familyCode') familyCode?: string): Promise<Array<ReportRow & { welfareConcern: boolean }>> {
    return this.reports.listQueue(familyCode);
  }

  @Post('admin/reports/:id/claim')
  @Roles('admin')
  async claim(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<ReportRow> {
    return this.reports.claim(id, actor.userId);
  }

  /**
   * A person decides. `dismissed` releases any hold this report placed;
   * `actioned` leaves the content down.
   */
  @Post('admin/reports/:id/resolve')
  @Roles('admin')
  async resolve(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Body() body: { decision?: string; note?: string },
  ): Promise<ReportRow> {
    if (body.decision !== 'actioned' && body.decision !== 'dismissed') {
      throw new BadRequestException("decision must be 'actioned' or 'dismissed'");
    }
    if (!body.note) throw new BadRequestException('note is required — a resolution without a reason is not a record');
    return this.reports.resolve({
      reportId: id,
      reviewerId: actor.userId,
      decision: body.decision,
      note: body.note,
    });
  }
}
