# LLM-as-judge

Grade one research run. Query: {{query}}
Report: {{report}}
Sources read during the run: {{sources}}

Score each criterion from 0.0 to 1.0:

| criterion | question |
|---|---|
| factual_accuracy | Do the claims match the sources? |
| citation_accuracy | Does each cited source actually support its claim? |
| completeness | Are all aspects of the query covered? |
| source_quality | Were primary, authoritative sources preferred over low-quality ones? |
| tool_efficiency | Were the right tools used a reasonable number of times? |

Return JSON: `{ "scores": { ...five criteria... }, "overall": 0.0, "pass": true, "notes": "..." }`.
`overall` is the mean; `pass` is true when overall >= 0.7 and no criterion is below 0.5.
Judge the end state of the report, not the path the agents took.
