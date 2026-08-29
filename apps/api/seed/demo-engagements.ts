/**
 * Completed engagements, with reviews — demo fixtures for the UI.
 *
 * This drives the REAL services through the real lifecycle: draft →
 * agree → agenda lock → escrow hold → submit → evaluate → complete →
 * review. Nothing is inserted straight into a table and no trigger is
 * disabled, which matters more here than convenience: writing rows
 * directly would produce engagements with no ledger postings, no escrow
 * and no frozen skill snapshot — data that looks right on a profile and
 * is wrong everywhere it counts, including in reconciliation.
 *
 * Consequence: every invariant applies. If this script runs, the money
 * balanced and the state machine allowed every transition.
 *
 * Test data only — never run against anything but a dev database.
 */
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/db.module';
import { AgendaService } from '../src/modules/agenda/agenda.service';
import { EvaluationService } from '../src/modules/assessment/evaluation.service';
import { SubmissionService } from '../src/modules/assessment/submission.service';
import { EngagementsService } from '../src/modules/engagements/engagements.service';
import { EscrowService } from '../src/modules/money/escrow.service';
import { ReviewService } from '../src/modules/reputation/review.service';

const DOMAIN = 'upsc_cse';

/** Deliberately varied: a profile where every review is five stars teaches a reader nothing. */
const SCRIPT: Array<{
  provider: string;
  seeker: string;
  amountPaise: bigint;
  lang: string;
  rating: number;
  body: string;
  dims: Array<[string, number]>;
  reply?: string;
}> = [
  {
    provider: 'asha.rathore@demo.local',
    seeker: 'priya.nair@demo.local',
    amountPaise: 120_000n,
    lang: 'en',
    rating: 5,
    body: 'Marked the structure hard, which is what I needed. Showed me I was writing conclusions that repeated the introduction rather than answering the question.',
    dims: [['clarity', 5], ['depth', 5], ['candour', 5], ['punctuality', 4]],
    reply: 'Thank you — keep the intro to two sentences and you will find the body has room to breathe.',
  },
  {
    provider: 'asha.rathore@demo.local',
    seeker: 'rahul.verma@demo.local',
    amountPaise: 95_000n,
    lang: 'hi',
    rating: 4,
    body: 'उत्तर की समीक्षा विस्तृत थी। थोड़ा और उदाहरण चाहिए था, पर दिशा स्पष्ट मिली।',
    dims: [['clarity', 4], ['depth', 4], ['candour', 5], ['punctuality', 4]],
  },
  {
    provider: 'asha.rathore@demo.local',
    seeker: 'sneha.iyer@demo.local',
    amountPaise: 80_000n,
    lang: 'en',
    rating: 3,
    body: 'Useful on content, thinner on how to actually restructure an answer under time pressure. Came back a day later than agreed.',
    dims: [['clarity', 3], ['depth', 4], ['candour', 4], ['punctuality', 2]],
    reply: 'Fair on the delay — that was mine, and I have tightened how many I take in a week.',
  },
  {
    provider: 'meera.banerjee@demo.local',
    seeker: 'priya.nair@demo.local',
    amountPaise: 150_000n,
    lang: 'en',
    rating: 5,
    body: 'The rubric made it obvious where the marks were actually going. First time I have seen my own weak spot written down rather than described vaguely.',
    dims: [['clarity', 5], ['depth', 5], ['candour', 4], ['punctuality', 5]],
  },
  {
    provider: 'meera.banerjee@demo.local',
    seeker: 'rahul.verma@demo.local',
    amountPaise: 110_000n,
    lang: 'hi',
    rating: 4,
    body: 'स्पष्ट और ईमानदार मूल्यांकन। समय पर मिला।',
    dims: [['clarity', 4], ['depth', 4], ['candour', 5], ['punctuality', 5]],
  },
];

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const pool = app.get<Pool>(PG_POOL);
  const engagements = app.get(EngagementsService);
  const agendas = app.get(AgendaService);
  const escrows = app.get(EscrowService);
  const submissions = app.get(SubmissionService);
  const evaluations = app.get(EvaluationService);
  const reviews = app.get(ReviewService);

  // Rates come from fee_schedule_at(ts) and are never hardcoded (#8), so
  // one has to exist before any escrow can be released. A dev database
  // without it fails at completion, not at booking — which is exactly the
  // kind of thing you only find by running the whole loop.
  const fee = await pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM fee_schedules WHERE currency = 'INR'`);
  if (fee.rows[0].n === '0') {
    await pool.query(
      `INSERT INTO fee_schedules (currency, effective_from, platform_fee_bps)
       VALUES ('INR', now() - interval '1 day', 1500)`,
    );
    console.log('fee schedule seeded (15%)');
  }

  // A leaf category that maps to skills AND has an assessment template —
  // an objective category has none, and evaluation would have nothing to
  // score against (hard rule #3).
  const cat = await pool.query<{ id: string }>(
    `SELECT c.id
       FROM categories c
       JOIN category_skills cs ON cs.category_id = c.id
       JOIN skills s ON s.id = cs.skill_id
      WHERE c.domain_code = $1 AND c.active AND s.template_id IS NOT NULL
      ORDER BY c.id
      LIMIT 1`,
    [DOMAIN],
  );
  if (cat.rows.length === 0) throw new Error('no category with an assessment template — run the domain seed first');
  const categoryId = cat.rows[0].id;

  async function userId(email: string, role: 'seeker' | 'provider'): Promise<string> {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (email, role, status, adult_confirmed_at)
       VALUES ($1, $2, 'active', now())
       ON CONFLICT (email) DO UPDATE SET status = 'active'
       RETURNING id`,
      [email, role],
    );
    return res.rows[0].id;
  }

  const already = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM engagements WHERE status = 'completed'`,
  );
  if (already.rows[0].n !== '0') {
    console.log(`${already.rows[0].n} completed engagement(s) already present — nothing to do`);
    await app.close();
    return;
  }

  for (const [i, s] of SCRIPT.entries()) {
    const providerId = await userId(s.provider, 'provider');
    const seekerId = await userId(s.seeker, 'seeker');

    const e = await engagements.createDraft({
      seekerId,
      providerId,
      domainCode: DOMAIN,
      categoryId,
      engagementType: 'document_review',
      currency: 'INR',
      amountPaise: s.amountPaise,
      language: s.lang,
    });
    await engagements.agree(e.id);

    const agenda = await agendas.createDraft({
      engagementId: e.id,
      originalLang: s.lang,
      expectedDeliverable: 'Annotated answer with a scored rubric',
      successCriteria: 'The seeker can name their three weakest areas',
      items: [
        { labelLang: s.lang, labelText: s.lang === 'hi' ? 'संरचना की समीक्षा करें' : 'Review the structure' },
        { labelLang: s.lang, labelText: s.lang === 'hi' ? 'तथ्यों की जाँच करें' : 'Check the factual claims' },
      ],
    });
    await agendas.lock(agenda.id);

    // Escrow is what flips it to working — the agenda alone is not enough (#12).
    await escrows.hold({
      engagementId: e.id,
      seekerId,
      providerId,
      currency: 'INR',
      amountPaise: s.amountPaise,
      idempotencyKey: `demo-hold:${e.id}`,
    });

    const submission = await submissions.submit({
      engagementId: e.id,
      seekerId,
      contentRef: `s3://private/demo/answer-${i + 1}.pdf`,
      note: 'Demo submission',
    });

    const ev = await evaluations.open({ engagementId: e.id, providerId, submissionId: submission.id });

    // Every dimension the bound template declares must be scored, and the
    // set comes from the template — never assumed here (#3).
    const dims = await pool.query<{ code: string }>(
      `SELECT d->>'code' AS code
         FROM assessment_templates t, jsonb_array_elements(t.dimensions) d
        WHERE t.id = $1`,
      [ev.templateId],
    );
    for (const d of dims.rows) {
      await evaluations.addScore({
        evaluationId: ev.id,
        dimensionCode: d.code,
        score: 55 + ((i * 7 + d.code.length * 3) % 35),
      });
    }
    await evaluations.return_(ev.id, { overallNote: 'Returned with per-dimension notes.' });
    await engagements.complete(e.id);

    const review = await reviews.leave({
      engagementId: e.id,
      reviewerId: seekerId,
      direction: 'seeker_on_provider',
      rating: s.rating,
      bodyOriginal: s.body,
      bodyLang: s.lang,
      dimensionScores: s.dims.map(([dimensionCode, score]) => ({ dimensionCode, score })),
    });

    if (s.reply) {
      await reviews.reply({
        reviewId: review.id,
        authorId: providerId,
        bodyOriginal: s.reply,
        bodyLang: 'en',
      });
    }

    console.log(`completed engagement ${i + 1}/${SCRIPT.length}: ${s.seeker} → ${s.provider}, ${s.rating}★`);
  }

  await app.close();
  console.log('\ndemo engagements and reviews ready');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
