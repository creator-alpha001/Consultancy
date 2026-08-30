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
import { PasswordService } from '../src/modules/identity/password.service';
import { DisputeService } from '../src/modules/disputes/dispute.service';
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
  const disputes = app.get(DisputeService);
  const passwords = app.get(PasswordService);

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

  // Guarded per fixture, not once for the whole script: a single
  // early return meant adding a new fixture did nothing on any database
  // that already had the old ones, which is every database that matters.
  const completedCount = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM engagements WHERE status = 'completed'`,
  );
  const needsCompleted = completedCount.rows[0].n === '0';
  if (!needsCompleted) {
    console.log(`${completedCount.rows[0].n} completed engagement(s) already present — skipping those`);
  }

  for (const [i, s] of (needsCompleted ? SCRIPT : []).entries()) {
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

  // ── One unanswered review, on demand ────────────────────────────────
  // `--fresh-review` adds a completed engagement whose review has no
  // reply. Replies are once-only and append-only, so once a journey has
  // answered every review a mentor has, it can never run again — the
  // same repeatability problem as a ruled dispute.
  if (process.argv.includes('--fresh-review')) {
    const providerId = await userId('asha.rathore@demo.local', 'provider');
    const seekerId = await userId('priya.nair@demo.local', 'seeker');
    const e = await engagements.createDraft({
      seekerId,
      providerId,
      domainCode: DOMAIN,
      categoryId,
      engagementType: 'document_review',
      currency: 'INR',
      amountPaise: 70_000n,
      language: 'en',
    });
    await engagements.agree(e.id);
    const agenda = await agendas.createDraft({
      engagementId: e.id,
      originalLang: 'en',
      expectedDeliverable: 'Annotated answer with a scored rubric',
      successCriteria: 'The seeker can name their three weakest areas',
      items: [{ labelLang: 'en', labelText: 'Review the structure' }],
    });
    await agendas.lock(agenda.id);
    await escrows.hold({
      engagementId: e.id,
      seekerId,
      providerId,
      currency: 'INR',
      amountPaise: 70_000n,
      idempotencyKey: `demo-hold:${e.id}`,
    });
    const submission = await submissions.submit({
      engagementId: e.id,
      seekerId,
      contentRef: 's3://private/demo/answer-unanswered.pdf',
      note: 'Demo submission',
    });
    const ev = await evaluations.open({ engagementId: e.id, providerId, submissionId: submission.id });
    const dims = await pool.query<{ code: string }>(
      `SELECT d->>'code' AS code FROM assessment_templates t, jsonb_array_elements(t.dimensions) d WHERE t.id = $1`,
      [ev.templateId],
    );
    for (const d of dims.rows) {
      await evaluations.addScore({ evaluationId: ev.id, dimensionCode: d.code, score: 68 });
    }
    await evaluations.return_(ev.id, { overallNote: 'Returned.' });
    await engagements.complete(e.id);
    await reviews.leave({
      engagementId: e.id,
      reviewerId: seekerId,
      direction: 'seeker_on_provider',
      rating: 4,
      bodyOriginal: 'Good detail on structure. I would have liked more on time management under exam conditions.',
      bodyLang: 'en',
      dimensionScores: [
        { dimensionCode: 'clarity', score: 4 },
        { dimensionCode: 'depth', score: 4 },
      ],
    });
    console.log('added one completed engagement with an unanswered review');
  }

  // ── A password on the demo accounts ─────────────────────────────────
  // Without one, nobody can sign in as a mentor who actually has reviews
  // and completed work, so every provider-side screen could only ever be
  // driven by a brand-new account with an empty profile. Hashed with the
  // app's own argon2id service rather than a literal, so it stays valid
  // if the parameters change.
  //
  // Dev fixture only — this file refuses to be anything else, and the
  // password is published here in plain sight precisely so it can never
  // be mistaken for a real one.
  const DEMO_PASSWORD = 'demo-password-not-a-secret';
  const demoHash = await passwords.hash(DEMO_PASSWORD);
  const withPassword = await pool.query(
    `UPDATE users SET password_hash = $1
      WHERE email LIKE '%@demo.local' AND password_hash IS NULL`,
    [demoHash],
  );
  if (withPassword.rowCount) {
    console.log(`${withPassword.rowCount} demo account(s) can now sign in (password: ${DEMO_PASSWORD})`);
  }

  // ── One disputed engagement ─────────────────────────────────────────
  // The dispute screens and the adjudication queue are unjudgeable
  // against an empty table, exactly as the review block was. Driven the
  // same way — real services, real escrow, real evidence assembly — so
  // the money is genuinely frozen rather than merely labelled disputed.
  // `--fresh-dispute` always creates another one. Dispute rows and their
  // evidence are append-only, so a ruled dispute cannot be reset — which
  // means the ops journey cannot re-use one and needs a new open dispute
  // on every run.
  const freshDispute = process.argv.includes('--fresh-dispute');
  const disputeCount = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM disputes WHERE status = 'open'`,
  );
  if (!freshDispute && disputeCount.rows[0].n !== '0') {
    console.log(`${disputeCount.rows[0].n} open dispute(s) already present — skipping`);
  } else {
    const providerId = await userId('vikram.kulkarni@demo.local', 'provider');
    const seekerId = await userId('sneha.iyer@demo.local', 'seeker');

    const e = await engagements.createDraft({
      seekerId,
      providerId,
      domainCode: DOMAIN,
      categoryId,
      engagementType: 'document_review',
      currency: 'INR',
      amountPaise: 90_000n,
      language: 'en',
    });
    await engagements.agree(e.id);
    const agenda = await agendas.createDraft({
      engagementId: e.id,
      originalLang: 'en',
      expectedDeliverable: 'Annotated answer with a scored rubric',
      successCriteria: 'The seeker can name their three weakest areas',
      items: [
        { labelLang: 'en', labelText: 'Review the structure' },
        { labelLang: 'en', labelText: 'Mark against the rubric' },
      ],
    });
    await agendas.lock(agenda.id);
    await escrows.hold({
      engagementId: e.id,
      seekerId,
      providerId,
      currency: 'INR',
      amountPaise: 90_000n,
      idempotencyKey: `demo-hold:${e.id}`,
    });
    const submission = await submissions.submit({
      engagementId: e.id,
      seekerId,
      contentRef: 's3://private/demo/answer-disputed.pdf',
      note: 'Demo submission',
    });
    const ev = await evaluations.open({ engagementId: e.id, providerId, submissionId: submission.id });
    const dims = await pool.query<{ code: string }>(
      `SELECT d->>'code' AS code FROM assessment_templates t, jsonb_array_elements(t.dimensions) d WHERE t.id = $1`,
      [ev.templateId],
    );
    for (const d of dims.rows) {
      await evaluations.addScore({ evaluationId: ev.id, dimensionCode: d.code, score: 41 });
    }
    await evaluations.return_(ev.id, { overallNote: 'Returned.' });

    await disputes.raise({
      engagementId: e.id,
      raisedBy: seekerId,
      reasonCode: 'work_not_as_agreed',
      bodyOriginal:
        'The agenda said the structure would be marked against the rubric and two of the four dimensions have no comment at all. I am not disputing the score, I am disputing that half of what we agreed was not done.',
      bodyLang: 'en',
    });
    console.log('raised one dispute (money frozen, evidence assembled)');
  }

  await app.close();
  console.log('\ndemo engagements, reviews and one open dispute ready');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
