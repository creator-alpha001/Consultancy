/// A localised string as the API sends it: `{ "en": "Mentor", "hi": "मेंटर" }`.
///
/// `en` is required and everything else is optional, so a pack that has
/// not been translated yet still renders rather than showing a key.
extension type const Label(Map<String, String> _values) {
  factory Label.fromJson(Map<String, dynamic> json) => Label(<String, String>{
    for (final MapEntry<String, dynamic> e in json.entries)
      if (e.value is String) e.key: e.value as String,
  });

  /// The text in [lang], falling back to English.
  ///
  /// Falling back rather than throwing is deliberate: a missing
  /// translation should degrade to a language the user probably reads,
  /// not blank a screen. The gap is a content problem, and hiding the
  /// content behind an error does not fix it.
  String call(String lang) => _values[lang] ?? _values['en'] ?? '';

  String get en => _values['en'] ?? '';

  bool has(String lang) => _values.containsKey(lang);

  Map<String, String> get raw => _values;
}
