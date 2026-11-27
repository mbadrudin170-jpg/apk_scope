"""Query RAG store + bangun prompt untuk LLM provider.

Jalankan:
    python backend/examples/query.py "status analisis apa saja?"
"""
from __future__ import annotations

import pickle
import sys
from pathlib import Path

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

STORE = Path(__file__).resolve().parents[1] / "rag_store"


def main() -> None:
    store_path = STORE / "store.pkl"
    if not store_path.exists():
        print("Jalankan ingest.py dulu.")
        return
    with store_path.open("rb") as f:
        store = pickle.load(f)
    vectorizer = store["vectorizer"]
    matrix = store["matrix"]
    docs = store["docs"]

    q = " ".join(sys.argv[1:]) or "apa itu APK Scope?"
    q_vec = vectorizer.transform([q])
    sims = cosine_similarity(q_vec, matrix)[0]
    top_idx = np.argsort(sims)[::-1][:3]
    ctx = "\n".join(docs[i] for i in top_idx if sims[i] > 0)

    prompt = (
        "Jawab berdasarkan konteks berikut. Jika tidak ada, katakan tidak tahu.\n\n"
        f"Konteks:\n{ctx}\n\nPertanyaan: {q}\nJawaban:"
    )
    print(prompt)
    # TODO: kirim prompt ke provider LLM (OpenAI/Anthropic/Ollama lokal) di sini


if __name__ == "__main__":
    main()
