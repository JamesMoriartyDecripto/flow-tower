"""Answer a question from the index; retry once if a claim has no citation."""
import re
import sqlite3
import sys

import anthropic
import sqlite_vec
import voyageai

vo, claude = voyageai.Client(), anthropic.Anthropic()
PROMPT = open("prompts/answer.md").read()


def retrieve(question: str, k: int = 5) -> list[str]:
    db = sqlite3.connect("index.db")
    db.enable_load_extension(True)
    sqlite_vec.load(db)
    q = vo.embed([question], model="voyage-3.5", input_type="query").embeddings[0]
    rows = db.execute("SELECT text FROM docs WHERE embedding MATCH ? AND k = ? ORDER BY distance",
                      (sqlite_vec.serialize_float32(q), k)).fetchall()
    return [r[0] for r in rows]


def answer(question: str) -> str:
    excerpts = "\n".join(f"[{i + 1}] {c}" for i, c in enumerate(retrieve(question)))
    prompt = PROMPT.replace("{{chunks}}", excerpts).replace("{{question}}", question)
    for _ in range(2):
        text = claude.messages.create(model="claude-haiku-5-5", max_tokens=600,
                                      messages=[{"role": "user", "content": prompt}]).content[0].text
        sentences = [s for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
        # Guard: every sentence carries a [n] citation, or the bot admits it does not know.
        if "Not in the docs" in text or all(re.search(r"\[\d+\]", s) for s in sentences):
            return text
        prompt += "\n\nYour last answer had uncited sentences. Cite every claim."
    return text


if __name__ == "__main__":
    print(answer(" ".join(sys.argv[1:])))
