"""Ingest data dari folder data/ -> store TF-IDF persisten (ringan, tanpa torch).

Struktur:
    backend/data/
      *.txt, *.md, *.jsonl ({"text": "..."})
Jalankan:
    mkdir -p backend/data
    echo "APK Scope pakai SQLite." > backend/data/notes.txt
    python backend/examples/ingest.py
"""
from __future__ import annotations

import json
import pickle
from pathlib import Path

from sklearn.feature_extraction.text import TfidfVectorizer

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
OUT_DIR = Path(__file__).resolve().parents[1] / "rag_store"
CHUNK = 500


def load_docs() -> list[str]:
    docs: list[str] = []
    for p in sorted(DATA_DIR.glob("*")):
        if p.suffix in (".txt", ".md"):
            text = p.read_text(encoding="utf-8")
            for i in range(0, len(text), CHUNK):
                chunk = text[i : i + CHUNK].strip()
                if chunk:
                    docs.append(chunk)
        elif p.suffix == ".jsonl":
            for line in p.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    obj = json.loads(line)
                    text = obj.get("text") or obj.get("content") or ""
                    if text.strip():
                        docs.append(text.strip())
    return docs


def main() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    docs = load_docs()
    if not docs:
        print("Tidak ada data di", DATA_DIR)
        return
    vectorizer = TfidfVectorizer()
    matrix = vectorizer.fit_transform(docs)
    OUT_DIR.mkdir(exist_ok=True)
    with (OUT_DIR / "store.pkl").open("wb") as f:
        pickle.dump({"vectorizer": vectorizer, "matrix": matrix, "docs": docs}, f)
    print(f"Disimpan {len(docs)} chunk ke {OUT_DIR}")


if __name__ == "__main__":
    main()
