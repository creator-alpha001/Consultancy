import 'family_theme.dart';
import 'label.dart';

/// The domain packs — the whole of the product's vocabulary and colour,
/// as data.
///
/// CLAUDE.md's central rule: the core is domain-agnostic, and everything
/// domain-specific is data in a three-tier model, family → domain →
/// category. Nothing in this app may hardcode a domain name, a category
/// name, a credential type, a skill code or an assessment dimension —
/// which in practice means every user-facing noun on every screen comes
/// from here.
///
/// Note what these types deliberately do NOT have: any field named after
/// an exam. A family that verifies music grades or tax practitioners
/// fills the same shapes.

/// The words a family calls things. Every one is overridable.
class Vocab {
  const Vocab({
    required this.seeker,
    required this.provider,
    required this.engagement,
    required this.agenda,
    required this.agendaItem,
    required this.assessment,
    required this.category,
  });

  factory Vocab.fromJson(Map<String, dynamic> json) => Vocab(
    seeker: _label(json['seeker'], 'Seeker'),
    provider: _label(json['provider'], 'Provider'),
    engagement: _label(json['engagement'], 'Engagement'),
    agenda: _label(json['agenda'], 'Agenda'),
    agendaItem: _label(json['agendaItem'], 'Goal'),
    assessment: _label(json['assessment'], 'Assessment'),
    category: _label(json['category'], 'Category'),
  );

  /// The platform's own neutral vocabulary — what the interface says when
  /// it is standing in no field at all: the landing screen, cross-field
  /// search, a person's own dashboard.
  ///
  /// This is NOT a family and never comes from a manifest. Something has
  /// to be able to render before — or without — the API answering, and a
  /// screen that renders one family's words while showing several
  /// families' records would be lying about what it is showing.
  static const Vocab platform = Vocab(
    seeker: Label(<String, String>{'en': 'Seeker'}),
    provider: Label(<String, String>{'en': 'Provider'}),
    engagement: Label(<String, String>{'en': 'Engagement'}),
    agenda: Label(<String, String>{'en': 'Agenda'}),
    agendaItem: Label(<String, String>{'en': 'Goal'}),
    assessment: Label(<String, String>{'en': 'Assessment'}),
    category: Label(<String, String>{'en': 'Category'}),
  );

  final Label seeker;
  final Label provider;
  final Label engagement;
  final Label agenda;
  final Label agendaItem;
  final Label assessment;
  final Label category;
}

/// A family's theme.
///
/// A family may colour its accent. It may not repaint the product
/// (CLAUDE.md #7): the ground, the ink, the lines, the verification green
/// and the danger red are the platform's and are deliberately absent from
/// this class. The exam family's ruled-paper, red-ink look is one
/// family's signature, not the platform's identity.
class FamilyTheme {
  const FamilyTheme({
    this.brand,
    this.brandHover,
    this.brandSoft,
    this.brandSoftInk,
    this.brandLine,
  });

  static const FamilyTheme none = FamilyTheme();

  final String? brand;
  final String? brandHover;
  final String? brandSoft;
  final String? brandSoftInk;
  final String? brandLine;

  bool get isEmpty => brand == null;
}

/// One domain, as the catalogue lists it. Deliberately narrow: browsing
/// the whole platform must not load every skill and rubric of every
/// family.
class DomainListing {
  const DomainListing({
    required this.code,
    required this.label,
    required this.languages,
    required this.defaultLanguage,
  });

  factory DomainListing.fromJson(Map<String, dynamic> json) {
    final Map<String, dynamic> labels =
        (json['labels'] as Map<String, dynamic>?) ?? const <String, dynamic>{};
    final String code = json['domainCode'] as String;
    return DomainListing(
      code: code,
      label: _label(labels['domain'], code),
      languages: _strings(json['languages']),
      defaultLanguage: json['defaultLanguage'] as String? ?? 'en',
    );
  }

  final String code;
  final Label label;
  final List<String> languages;
  final String defaultLanguage;
}

/// A family in the catalogue, with the domains the caller may see.
class CatalogueFamily {
  const CatalogueFamily({
    required this.code,
    required this.label,
    required this.vocab,
    required this.theme,
    required this.domains,
  });

  factory CatalogueFamily.fromJson(Map<String, dynamic> json) {
    final Map<String, dynamic> labels =
        (json['labels'] as Map<String, dynamic>?) ?? const <String, dynamic>{};
    final String code = json['code'] as String;
    return CatalogueFamily(
      code: code,
      label: _label(labels['family'], code),
      vocab: Vocab.fromJson(labels),
      // NOT a straight read: the manifest publishes one accent and the
      // interface needs four relations around it, derived with exactly
      // the maths apps/frontend uses. See pack/family_theme.dart.
      theme: FamilyThemeResolver.resolve(json['theme'] as Map<String, dynamic>?),
      domains: <DomainListing>[
        for (final Object? d in (json['domains'] as List<Object?>? ?? const <Object?>[]))
          if (d is Map<String, dynamic>) DomainListing.fromJson(d),
      ],
    );
  }

  final String code;
  final Label label;
  final Vocab vocab;
  final FamilyTheme theme;
  final List<DomainListing> domains;
}

/// The whole published catalogue: every family and its listed domains.
class Catalogue {
  const Catalogue(this.families);

  factory Catalogue.fromJson(List<Object?> json) => Catalogue(<CatalogueFamily>[
    for (final Object? f in json)
      if (f is Map<String, dynamic>) CatalogueFamily.fromJson(f),
  ]);

  static const Catalogue empty = Catalogue(<CatalogueFamily>[]);

  final List<CatalogueFamily> families;

  CatalogueFamily? family(String code) {
    for (final CatalogueFamily f in families) {
      if (f.code == code) return f;
    }
    return null;
  }

  /// The family a domain belongs to. A record names its domain; the
  /// vocabulary and colour it should be rendered in come from the family
  /// above it, which is what this resolves.
  CatalogueFamily? familyOfDomain(String domainCode) {
    for (final CatalogueFamily f in families) {
      for (final DomainListing d in f.domains) {
        if (d.code == domainCode) return f;
      }
    }
    return null;
  }

  /// Every listed domain, flattened. A seeker has MANY active domains
  /// (CLAUDE.md #6), so the cross-field views are the normal case rather
  /// than a special one.
  List<DomainListing> get allDomains => <DomainListing>[
    for (final CatalogueFamily f in families) ...f.domains,
  ];
}

Label _label(Object? raw, String fallback) => raw is Map<String, dynamic>
    ? Label.fromJson(raw)
    : Label(<String, String>{'en': fallback});

List<String> _strings(Object? raw) => <String>[
  for (final Object? v in (raw as List<Object?>? ?? const <Object?>[]))
    if (v is String) v,
];
