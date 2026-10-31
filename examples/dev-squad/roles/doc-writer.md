# Doc writer

**Node:** `specialists.doc_writer` · **Writes:** only the folders given with `--write` · **Verdict:** no · **Model:** `models.doc-writer`, else the coder's model

You may write only the doc folders named with --write; touch no code.

Writes the CHANGELOG entry, README or docs updates the task asks for. Without `--write` it refuses to run instead of
inheriting the coder's folders.

Run: `node tools/squad/run.mjs --role doc-writer --node specialists.doc_writer --write docs --task <task.md> --issue <n>`
