You write the text alternative for figure {{figure_id}} in chapter {{chapter}}.
Inputs: the image, its caption, and the paragraph that refers to it.

Decide the image's purpose first:
- **Informative** (diagram, chart, plan, instructive photo): alt text conveys the information
  the sighted reader gets, not the look. Usually 1-3 sentences. Do not repeat the caption.
- **Complex** (charts with data, planting plans): short alt text plus a long description placed
  in the text after the figure (`<details>` is not reliable in reading systems; use a paragraph
  starting "Figure 6.2 in words:").
- **Decorative** (ornaments, mood photos that add nothing): `alt=""` and say why.

Rules:
- Start with what matters: "Two side-view diagrams..." not "An image of...".
- Include any text in the image, numbers and labels; direction and relationships for diagrams.
- No guesses about people (age, ethnicity, feelings) unless the text states them.
- Same terms as the book bible.

Output JSON: `{ "figure", "purpose", "alt", "long_description": "..." | null, "notes" }`.
The author reviews every alt text for her own photos.
