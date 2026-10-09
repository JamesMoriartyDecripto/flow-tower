#!/usr/bin/env bash
# Deterministic ebook build + validation (GitHub Actions runs it on every manuscript tag).
# No model calls. Needs: pandoc 3.12, typst, Java 17+, EPUBCheck 5.4.0 jar, @daisy/ace 1.4.6, jq, zip.
# Usage: scripts/build-ebook.sh v1.0.0
set -euo pipefail

VERSION="${1:?usage: build-ebook.sh <version>}"
EPUBCHECK_JAR="${EPUBCHECK_JAR:-tools/epubcheck-5.4.0/epubcheck.jar}"
EPUB="out/the-balcony-harvest.epub"
PDF="out/the-balcony-harvest-6x9.pdf"
REPORTS="out/reports"
mkdir -p out "$REPORTS"
echo "build $VERSION pandoc=$(pandoc --version | sed -n 1p | cut -d' ' -f2) ace=$(ace --version)"

echo "::group::EPUB 3 (Pandoc)"
pandoc --defaults build/pandoc-epub.yaml
echo "::endgroup::"

echo "::group::Conformance metadata (EPUB Accessibility 1.1, 3.5)"
# Pandoc writes the schema: discovery metadata; conformsTo and certifiedBy are added here.
WORK="$(mktemp -d)"
unzip -q "$EPUB" -d "$WORK"
OPF="$WORK/EPUB/content.opf"
if ! grep -q 'dcterms:conformsTo' "$OPF"; then
  CONF='<meta property="dcterms:conformsTo">EPUB Accessibility 1.1 - WCAG 2.2 Level AA</meta>'
  CERT='<meta property="a11y:certifiedBy">Larchwood Press</meta>'
  sed -i "s#</metadata>#  ${CONF}\n    ${CERT}\n  </metadata>#" "$OPF"
fi
# Repack: mimetype first and stored uncompressed, as the OCF spec requires.
rm -f "$EPUB"
(cd "$WORK" && zip -X0q "$OLDPWD/$EPUB" mimetype && zip -X9rq "$OLDPWD/$EPUB" META-INF EPUB)
rm -rf "$WORK"
echo "::endgroup::"

echo "::group::EPUBCheck"
# Errors and warnings both fail the build.
if ! java -jar "$EPUBCHECK_JAR" "$EPUB" --failonwarnings --json "$REPORTS/epubcheck.json"; then
  echo "::error::EPUBCheck failed, see $REPORTS/epubcheck.json"; exit 1
fi
echo "::endgroup::"

echo "::group::Ace by DAISY"
ace --force --outdir "$REPORTS/ace" "$EPUB"
# Ace exits 0 even when it finds violations, so count them from the report.
SEVERE=$(jq '[.assertions[].assertions[]?
  | select(.["earl:test"]["earl:impact"] == "serious" or .["earl:test"]["earl:impact"] == "critical")]
  | length' "$REPORTS/ace/report.json")
MODERATE=$(jq '[.assertions[].assertions[]? | select(.["earl:test"]["earl:impact"] == "moderate")] | length' \
  "$REPORTS/ace/report.json")
echo "ace serious+critical=$SEVERE moderate=$MODERATE"
[ "$SEVERE" -eq 0 ] || { echo "::error::Ace found $SEVERE serious/critical violations"; exit 1; }
echo "::endgroup::"

echo "::group::Print PDF (Typst, 6 x 9 in)"
pandoc --defaults build/pandoc-epub.yaml -t typst --pdf-engine=typst \
  -V papersize=us-trade -V fontsize=10.5pt -o "$PDF"
echo "::endgroup::"

sha256sum "$EPUB" "$PDF" | tee "out/SHA256SUMS"
SIZE_MB=$(( $(stat -c%s "$EPUB") / 1048576 ))
echo "done $VERSION epub=${SIZE_MB}MB severe=$SEVERE moderate=$MODERATE"
