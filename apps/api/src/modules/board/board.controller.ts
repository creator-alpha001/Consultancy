import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { CurrentActor, Public, Roles } from '../identity/auth.guard';
import { Actor } from '../identity/types';
import { BoardPostService } from './board-post.service';
import { ProposalService } from './proposal.service';
import { QuestionService } from './question.service';
import { AskQuestionResult, BoardPostRow, ProposalRow, QuestionRow } from './types';

/**
 * The board: open requests, proposals, and free questions.
 *
 * Two rules shape this controller more than anything else:
 *  - **#15, no price sorting.** There is no `sort` parameter on the
 *    proposal or post routes. Not "ignored if passed" — absent, so a
 *    client cannot even express it.
 *  - **#28.** `seekerId`/`providerId` are always the session's actor,
 *    never a body field, so nobody can post or propose as someone else.
 */
@Controller('board')
export class BoardController {
  constructor(
    @Inject(BoardPostService) private readonly posts: BoardPostService,
    @Inject(ProposalService) private readonly proposals: ProposalService,
    @Inject(QuestionService) private readonly questions: QuestionService,
  ) {}

  // ── Open requests ───────────────────────────────────────────────────

  /** Cross-domain by default: with no filter this searches every domain the seeker is active in (#6). */
  @Get('posts')
  async searchOpen(
    @CurrentActor() actor: Actor,
    @Query('domainCode') domainCode?: string,
    @Query('categoryId') categoryId?: string,
    @Query('language') language?: string,
  ): Promise<BoardPostRow[]> {
    return this.posts.searchOpen({
      seekerId: actor.userId,
      domainCodes: domainCode ? [domainCode] : undefined,
      categoryId,
      language,
    });
  }

  @Get('posts/:id')
  async getPost(@Param('id') id: string): Promise<BoardPostRow> {
    return this.posts.get(id);
  }

  @Post('posts')
  async createPost(
    @CurrentActor() actor: Actor,
    @Body()
    body: {
      domainCode: string;
      categoryId: string;
      engagementType: string;
      language: string;
      currency: string;
      budgetMinPaise: string | number;
      budgetMaxPaise: string | number;
      description?: string;
    },
  ): Promise<BoardPostRow> {
    return this.posts.create({
      seekerId: actor.userId,
      domainCode: body.domainCode,
      categoryId: body.categoryId,
      engagementType: body.engagementType,
      language: body.language,
      currency: body.currency,
      budgetMinPaise: BigInt(body.budgetMinPaise),
      budgetMaxPaise: BigInt(body.budgetMaxPaise),
      description: body.description,
    });
  }

  @Post('posts/:id/cancel')
  async cancelPost(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<BoardPostRow> {
    return this.posts.cancel(id, actor.userId);
  }

  // ── Proposals ───────────────────────────────────────────────────────

  /** Recency order, never price (#15). The seeker choosing is the point. */
  @Get('posts/:id/proposals')
  async listProposals(@Param('id') id: string): Promise<ProposalRow[]> {
    return this.proposals.listForPost(id);
  }

  @Post('posts/:id/proposals')
  @Roles('provider')
  async submitProposal(
    @Param('id') boardPostId: string,
    @CurrentActor() actor: Actor,
    @Body() body: { message?: string; proposedAmountPaise: string | number },
  ): Promise<ProposalRow> {
    return this.proposals.submit({
      boardPostId,
      providerId: actor.userId,
      message: body.message,
      proposedAmountPaise: BigInt(body.proposedAmountPaise),
    });
  }

  /** The moment a stranger becomes an assigned provider on a real engagement. */
  @Post('proposals/:id/accept')
  async acceptProposal(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<ProposalRow> {
    return this.proposals.accept(id, actor.userId);
  }

  @Post('proposals/:id/withdraw')
  @Roles('provider')
  async withdrawProposal(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<ProposalRow> {
    return this.proposals.withdraw(id, actor.userId);
  }

  // ── Free questions ──────────────────────────────────────────────────

  /** Public: the question board is readable before signing up. */
  @Get('questions')
  @Public()
  async listQuestions(@Query('domainCode') domainCode: string): Promise<QuestionRow[]> {
    return this.questions.listPublished(domainCode);
  }

  /**
   * One question and its answers. Public, like the list — and held
   * content (whether the classifier held it or a report did) is not in
   * either.
   */
  @Get('questions/:id')
  @Public()
  async getQuestion(@Param('id') id: string): Promise<unknown> {
    return this.questions.getWithAnswers(id);
  }

  /**
   * A flagged question is HELD, never rejected, and a distress flag comes
   * back with the family's real helpline numbers (#25). The caller gets
   * `supportResources` in that case — the UI must show them rather than a
   * moderation message.
   */
  @Post('questions')
  async askQuestion(
    @CurrentActor() actor: Actor,
    @Body() body: { domainCode: string; categoryId?: string; bodyOriginal: string; bodyLang: string },
  ): Promise<AskQuestionResult> {
    return this.questions.ask({ seekerId: actor.userId, ...body });
  }

  @Post('questions/:id/answers')
  @Roles('provider')
  async answerQuestion(
    @Param('id') questionId: string,
    @CurrentActor() actor: Actor,
    @Body() body: { body: string },
  ): Promise<unknown> {
    return this.questions.answer(questionId, actor.userId, body.body);
  }

  /** Ops queue for held content — never public (#25). */
  @Get('moderation/held')
  @Roles('admin')
  async listHeld(): Promise<QuestionRow[]> {
    return this.questions.listHeldForReview();
  }

  @Post('moderation/held/:id/clear')
  @Roles('admin')
  async clearHeld(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<QuestionRow> {
    return this.questions.clearForReview(id, { actorId: actor.userId, actorRole: actor.role });
  }
}
