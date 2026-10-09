"""Nightly ingestion: split Markdown docs by heading, embed, store in sqlite-vec."""
import pathlib
import re
import sqlite3

import sqlite_vec
import voyageai

DB = "index.db"
vo = voyageai.Client()


def chunks(path: pathlib.Path):
    # One chunk per "## " section keeps answers anchored to a heading users recognise.
    for section in re.split(r"\n(?=## )", path.read_text()):
        if section.strip():
            yield f"{path.name}: {section.strip()[:2000]}"


def main():
    db = sqlite3.connect(DB)
    db.enable_load_extension(True)
    sqlite_vec.load(db)
    db.execute("CREATE VIRTUAL TABLE IF NOT EXISTS docs USING vec0(embedding float[1024], +text TEXT)")
    texts = [c for p in pathlib.Path("docs").glob("**/*.md") for c in chunks(p)]
    for i in range(0, len(texts), 128):
        batch = texts[i:i + 128]
        vectors = vo.embed(batch, model="voyage-3.5", input_type="document").embeddings
        db.executemany("INSERT INTO docs(embedding, text) VALUES (?, ?)",
                       [(sqlite_vec.serialize_float32(v), t) for v, t in zip(vectors, batch)])
    db.commit()


if __name__ == "__main__":
    main()
