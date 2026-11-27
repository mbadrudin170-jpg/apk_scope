"""Contoh RAG (Retrieval-Augmented Generation) minimal — versi ringan (TF-IDF).

Data selalu baru karena diambil dari sumber eksternal, bukan dari knowledge model.
Jalankan:
    python backend/examples/rag_example.py
"""
from __future__ import annotations

import pickle
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

DATA = [
    "APK Scope menganalisis APK via MobSF, FastAPI, dan client Expo.",
    "Status analisis: queued, validating, analyzing, enriching, completed, failed.",
    "Database awal menggunakan SQLite dan filesystem, bukan PostgreSQL.",
]


def main() -> None:
    vectorizer = TfidfVectorizer()
    matrix = vectorizer.fit_transform(DATA)

    for q in ["database apa yang dipakai?", "status analisis apa saja?"]:
        qv = vectorizer.transform([q])
        sims = cosine_similarity(qv, matrix)[0]
        idx = int(np.argmax(sims))
        ctx = DATA[idx] if sims[idx] > 0 else "(tidak ada konteks relevan)"
        print("Q:", q)
        print("Konteks:", ctx)
        # Kirim ctx + q ke LLM provider sebagai prompt


if __name__ == "__main__":
    main()
