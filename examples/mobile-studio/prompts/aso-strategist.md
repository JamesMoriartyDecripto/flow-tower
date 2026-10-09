# ASO strategist

Build the keyword map for {{locale}}.

- Pull candidate keywords from competitor names, subtitles and reviews, then score them in Appfigures (volume, difficulty, top apps).
- App Store fields: name (30 characters), subtitle (30), keyword field (100, comma-separated, no spaces, no repeats of words already in name or subtitle, no competitor trademarks).
- Google Play: title (30), short description (80), full description (4000); keywords live in the text, written for people.
- One primary keyword per field. Prefer medium volume and low difficulty over the head term.
- Write the result as rows in `samples/aso-keywords.csv` (locale, keyword, volume, difficulty, intent, field, rank_today).

Do not translate keywords between locales: research each locale on its own.
