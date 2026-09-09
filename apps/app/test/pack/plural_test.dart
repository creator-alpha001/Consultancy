import 'package:flutter_test/flutter_test.dart';
import 'package:sankalp_app/pack/label.dart';
import 'package:sankalp_app/pack/plural.dart';
import 'package:sankalp_app/theme/script.dart';

/// The regression suite for a bug that shipped.
///
/// The web build rendered `2 मेंटरs` and `an अभ्यर्थी account`. These
/// tests are the reason it cannot happen again here — and the Devanagari
/// cases are the ones that matter, because the English cases were never
/// what broke.
void main() {
  const Label provider = Label(<String, String>{'en': 'Mentor', 'hi': 'मेंटर'});
  const Label seeker = Label(<String, String>{'en': 'Aspirant', 'hi': 'अभ्यर्थी'});

  group('the bug that shipped', () {
    test('does not weld an English plural onto a Devanagari noun', () {
      final String out = Plural.count(2, provider, 'hi');
      expect(out, '2 मेंटर');
      expect(out, isNot(contains('s')));
    });

    test('does not put an English article in front of a Devanagari noun', () {
      final String out = Plural.withArticle(seeker, 'hi');
      expect(out, 'अभ्यर्थी');
      expect(out, isNot(startsWith('an ')));
      expect(out, isNot(startsWith('a ')));
    });
  });

  group('English still behaves like English', () {
    test('pluralises with s', () {
      expect(Plural.count(2, provider, 'en'), '2 Mentors');
    });

    test('leaves a count of one alone', () {
      expect(Plural.count(1, provider, 'en'), '1 Mentor');
      expect(Plural.count(1, provider, 'hi'), '1 मेंटर');
    });

    test('handles zero as a plural', () {
      expect(Plural.count(0, provider, 'en'), '0 Mentors');
    });

    test('uses -es after a sibilant', () {
      const Label coach = Label(<String, String>{'en': 'Coach'});
      expect(Plural.plural(coach, 'en'), 'Coaches');
    });

    test('uses -ies after a consonant + y', () {
      const Label body = Label(<String, String>{'en': 'Body'});
      expect(Plural.plural(body, 'en'), 'Bodies');
    });

    test('keeps -ys after a vowel + y', () {
      const Label day = Label(<String, String>{'en': 'Day'});
      expect(Plural.plural(day, 'en'), 'Days');
    });

    test('picks the article by vowel', () {
      expect(Plural.withArticle(seeker, 'en'), 'an Aspirant');
      expect(Plural.withArticle(provider, 'en'), 'a Mentor');
    });
  });

  group('falling back', () {
    test('uses English when the language is missing from the label', () {
      // And pluralises it as ENGLISH, because English is the text that
      // will actually be on the screen. The decision follows the string,
      // not the requested language — see Plural._suffixPluralises.
      expect(Plural.count(2, provider, 'ta'), '2 Mentors');
    });

    test('a Tamil-script label is not given an English plural', () {
      const Label tamil = Label(<String, String>{'en': 'Mentor', 'ta': 'வழிகாட்டி'});
      expect(Plural.count(2, tamil, 'ta'), '2 வழிகாட்டி');
    });

    test('a label with no English at all still renders something', () {
      const Label odd = Label(<String, String>{'hi': 'मेंटर'});
      expect(odd('en'), '');
      expect(odd('hi'), 'मेंटर');
    });
  });

  group('script detection', () {
    test('finds Devanagari', () {
      expect(Script.hasDevanagari('मेंटर'), isTrue);
      expect(Script.hasDevanagari('Mentor'), isFalse);
    });

    test('finds Devanagari in a mixed string — the half that breaks', () {
      expect(Script.hasDevanagari('UPSC मुख्य परीक्षा'), isTrue);
    });

    test('picks the Devanagari face for a mixed string', () {
      expect(Script.familyFor('UPSC मुख्य'), 'Noto Sans Devanagari');
      expect(Script.familyFor('UPSC Mains'), 'Inter');
    });

    test('always offers the other face as a fallback', () {
      expect(Script.fallbacksFor('मेंटर'), contains('Inter'));
      expect(Script.fallbacksFor('Mentor'), contains('Noto Sans Devanagari'));
    });
  });
}
