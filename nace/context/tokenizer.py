"""Token estimation. Exact only if a real tokenizer/API provides counts; otherwise labelled approximation."""
from __future__ import annotations
import re
class Tokenizer:
    """Approximation: ~4 chars/token for English, adjusted for code. Never presented as exact."""
    exact = False
    def count(self, text: str) -> int:
        if not text: return 0
        words = len(re.findall(r"\S+", text))
        chars = len(text)
        # blend: max of word-based and char-based heuristics
        return max(1, int(chars/4), int(words*1.3))
    def count_messages(self, messages) -> int:
        return sum(self.count(m.get("content","")) + 4 for m in messages)
