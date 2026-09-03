import { TrainingModuleInput } from '../src/modules/domains/types';

/**
 * What a mentor is taught before they can take paid work.
 *
 * Family data, in its own file because it is CONTENT — it will be revised
 * by people who are not engineers, a helpline number will change, a rule
 * will change, and none of that should need anyone to read TypeScript
 * around it.
 *
 * The distress module is the reason this exists at all. CLAUDE.md #24 and
 * #25: this population has a documented mental-health crisis, and a
 * mentor who has never been told there IS an escalation path will meet
 * one unprepared, in a session, in real time. Both modules are required
 * and every question has to be right — there is none a mentor may get
 * wrong and still be ready.
 *
 * Written in English and Hindi rather than machine-translated. A
 * Hindi-medium mentor reading guidance about someone else's distress in
 * broken Hindi will not trust it, and this is the one place that matters
 * most.
 */
export function civilServicesTraining(): TrainingModuleInput[] {
  return [
    {
      code: 'platform_rules',
      required: true,
      labels: { en: 'How this platform works', hi: 'यह मंच कैसे काम करता है' },
      sections: [
        {
          heading: { en: 'The agenda is the contract', hi: 'लक्ष्य ही अनुबंध है' },
          body: {
            en:
              'Before any work starts, you and the aspirant agree a written list of goals. Once it is locked ' +
              'it cannot be changed — a change needs a new version that both of you accept. In a dispute, ' +
              'that list is what gets read, in the language it was written in.',
            hi:
              'काम शुरू होने से पहले आप और अभ्यर्थी लिखित लक्ष्यों पर सहमत होते हैं। लॉक होने के बाद उसे ' +
              'बदला नहीं जा सकता। विवाद में वही सूची पढ़ी जाती है, उसी भाषा में जिसमें लिखी गई थी।',
          },
        },
        {
          heading: { en: 'Money is held, not paid', hi: 'पैसा रोका जाता है, दिया नहीं जाता' },
          body: {
            en:
              'The aspirant pays before you start, but the money sits in escrow with a licensed payment ' +
              'aggregator. It reaches you when they confirm the agreed goals were met. You may charge less ' +
              'once the work has started — you may never negotiate the price before it.',
            hi:
              'अभ्यर्थी पहले भुगतान करता है, पर पैसा एस्क्रो में रहता है। लक्ष्य पूरे होने की पुष्टि पर आपको ' +
              'मिलता है। काम शुरू होने के बाद आप कम ले सकते हैं; उससे पहले मोल-भाव नहीं कर सकते।',
          },
        },
        {
          heading: { en: 'What you may never promise', hi: 'आप क्या वादा नहीं कर सकते' },
          body: {
            en:
              'No outcome. Not a rank, not selection, not a mark. You may say what a stronger answer looks ' +
              'like; you may not say what it will score. And never compare one aspirant to another — ' +
              'progress here is measured against their own earlier work and nothing else.',
            hi:
              'किसी परिणाम का वादा नहीं — न रैंक, न चयन, न अंक। आप बता सकते हैं कि बेहतर उत्तर कैसा होता ' +
              'है; यह नहीं कि उसे कितने अंक मिलेंगे। किसी अभ्यर्थी की तुलना दूसरे से कभी न करें।',
          },
        },
      ],
      questions: [
        {
          code: 'agenda_change',
          prompt: {
            en: 'Halfway through, the aspirant asks you to review a second answer as well. What is correct?',
            hi: 'बीच में अभ्यर्थी दूसरा उत्तर भी देखने को कहता है। सही क्या है?',
          },
          options: [
            { code: 'a', labels: { en: 'Do it — it is a small extra', hi: 'कर दें — छोटी बात है' } },
            {
              code: 'b',
              labels: {
                en: 'Agree a change to the goals first, so you both hold the same list',
                hi: 'पहले लक्ष्यों में बदलाव पर सहमति लें',
              },
            },
            { code: 'c', labels: { en: 'Refuse — the agenda can never change', hi: 'मना करें — लक्ष्य कभी नहीं बदलते' } },
          ],
          correct: 'b',
        },
        {
          code: 'outcome_promise',
          prompt: {
            en: 'Which of these may you write in an evaluation?',
            hi: 'मूल्यांकन में आप इनमें से क्या लिख सकते हैं?',
          },
          options: [
            { code: 'a', labels: { en: 'This answer would fetch 9 or 10 marks', hi: 'इस उत्तर को 9-10 अंक मिलेंगे' } },
            { code: 'b', labels: { en: 'At this standard you will clear Mains', hi: 'इस स्तर पर आप मुख्य परीक्षा निकाल लेंगे' } },
            {
              code: 'c',
              labels: {
                en: 'Your introduction states the issue but never examines it',
                hi: 'आपकी भूमिका मुद्दा बताती है, उसकी परीक्षा नहीं करती',
              },
            },
          ],
          correct: 'c',
        },
        {
          code: 'price_change',
          prompt: {
            en: 'An aspirant asks for a discount before booking. What is correct?',
            hi: 'बुकिंग से पहले अभ्यर्थी छूट मांगता है। सही क्या है?',
          },
          options: [
            { code: 'a', labels: { en: 'Agree a lower price with them', hi: 'कम कीमत पर सहमत हों' } },
            {
              code: 'b',
              labels: {
                en: 'The published price stands; you may reduce it later, once the work has started',
                hi: 'प्रकाशित कीमत ही लागू; काम शुरू होने पर आप कम कर सकते हैं',
              },
            },
            { code: 'c', labels: { en: 'Decline the booking', hi: 'बुकिंग अस्वीकार करें' } },
          ],
          correct: 'b',
        },
      ],
    },

    {
      code: 'distress_escalation',
      required: true,
      labels: { en: 'When someone is struggling', hi: 'जब कोई संघर्ष कर रहा हो' },
      sections: [
        {
          heading: { en: 'Why this module exists', hi: 'यह मॉड्यूल क्यों है' },
          body: {
            en:
              'Years of preparation, repeated failure and long isolation are ordinary in this population, ' +
              'and so is serious distress. You will meet it. Not often, but you will — and probably in the ' +
              'middle of a conversation about something else entirely.',
            hi:
              'वर्षों की तैयारी, बार-बार असफलता और लंबा अकेलापन यहाँ सामान्य हैं, और गंभीर मानसिक संकट भी। ' +
              'आप इसका सामना करेंगे — शायद किसी और बात के बीच में।',
          },
        },
        {
          heading: { en: 'What to do', hi: 'क्या करें' },
          body: {
            en:
              'Stay with them. Do not end the session in order to escalate. Say plainly that you have heard ' +
              'them and that help exists, and give them the helpline numbers shown on this page. Then report ' +
              'it through the platform so a trained person follows up. You are not their counsellor and ' +
              'nobody expects you to be — you are the person who was there.',
            hi:
              'उनके साथ रहें। आगे बढ़ाने के लिए सत्र समाप्त न करें। स्पष्ट कहें कि आपने उन्हें सुना और सहायता ' +
              'उपलब्ध है, और इस पृष्ठ पर दिए हेल्पलाइन नंबर दें। फिर मंच पर रिपोर्ट करें ताकि प्रशिक्षित ' +
              'व्यक्ति संपर्क करे। आप उनके परामर्शदाता नहीं हैं।',
          },
        },
        {
          heading: { en: 'What never to do', hi: 'क्या कभी न करें' },
          body: {
            en:
              'Do not tell them to work harder. Do not treat it as a motivation problem. Do not promise it ' +
              'will be fine if they simply keep going. And do not keep it to yourself because it felt ' +
              'private — reporting is not a punishment, and their post is never taken down for it.',
            hi:
              'यह न कहें कि और मेहनत करें। इसे प्रेरणा की समस्या न समझें। यह वादा न करें कि लगे रहने से सब ' +
              'ठीक हो जाएगा। और इसे अपने तक न रखें — रिपोर्ट करना दंड नहीं है।',
          },
        },
      ],
      questions: [
        {
          code: 'mid_session',
          prompt: {
            en:
              'Mid-session, an aspirant tells you they have been thinking about harming themselves. What do ' +
              'you do first?',
            hi: 'सत्र के बीच अभ्यर्थी कहता है कि उसने स्वयं को हानि पहुँचाने के बारे में सोचा है। पहले क्या करें?',
          },
          options: [
            { code: 'a', labels: { en: 'End the session so they can get help', hi: 'सत्र समाप्त करें' } },
            {
              code: 'b',
              labels: {
                en: 'Stay with them, say you have heard them, and give them the helpline numbers',
                hi: 'उनके साथ रहें, कहें कि आपने सुना, और हेल्पलाइन नंबर दें',
              },
            },
            {
              code: 'c',
              labels: { en: 'Change the subject and finish the review', hi: 'विषय बदलें और समीक्षा पूरी करें' },
            },
          ],
          correct: 'b',
        },
        {
          code: 'after',
          prompt: { en: 'Afterwards, what do you do?', hi: 'उसके बाद आप क्या करते हैं?' },
          options: [
            {
              code: 'a',
              labels: {
                en: 'Report it on the platform so a trained person follows up',
                hi: 'मंच पर रिपोर्ट करें ताकि प्रशिक्षित व्यक्ति संपर्क करे',
              },
            },
            { code: 'b', labels: { en: 'Nothing — it was said in confidence', hi: 'कुछ नहीं — यह गोपनीय था' } },
            { code: 'c', labels: { en: 'Post about it so others can help', hi: 'इसके बारे में पोस्ट करें' } },
          ],
          correct: 'a',
        },
        {
          code: 'not_motivation',
          prompt: { en: 'Which response is wrong?', hi: 'कौन-सी प्रतिक्रिया गलत है?' },
          options: [
            {
              code: 'a',
              labels: { en: 'Telling them help exists and where to find it', hi: 'बताना कि सहायता है और कहाँ' },
            },
            {
              code: 'b',
              labels: {
                en: 'Telling them they just need to work harder and stay motivated',
                hi: 'कहना कि बस और मेहनत करें और प्रेरित रहें',
              },
            },
            {
              code: 'c',
              labels: { en: 'Staying with them rather than ending the call', hi: 'कॉल समाप्त करने के बजाय साथ रहना' },
            },
          ],
          correct: 'b',
        },
      ],
    },
  ];
}
