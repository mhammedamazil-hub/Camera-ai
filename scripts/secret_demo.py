"""Secret-fact demo: teach -> sleep -> NEW session -> ask questions.
Run: python3 scripts/secret_demo.py"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from nace.core.config import NaceConfig
from nace.core.orchestrator import Orchestrator
from nace.models.providers import MockProvider

DB = "./data-secret"
SECRET = "The Keralan monsoon project codename is 'Vrishti-7749' and its budget code is KLM-42-ZULU."

print("=== SESSION 1: teaching NACE something it cannot know ===")
o = Orchestrator(NaceConfig(data_dir=DB), provider=MockProvider())
o.record_event("user-fact", SECRET, kind="fact", project="monsoon")
o.store.add(type="semantic", title="monsoon codename", content=SECRET,
            project="monsoon", confidence=1.0, importance=0.95, source="user", provenance="user")
print("Stored with provenance=user, confidence=1.0 (user-provided fact, not model speculation)")
rep = o.sleep_now(reason="demo-sleep", project="monsoon")
print(f"SLEEP: {rep['experiences_analyzed']} experiences -> {rep['new_semantic']} semantic memories, checkpoint={rep['checkpoint']}, resume={rep['resume_state']}")
o.close()
print("(process ends — all in-memory context destroyed)")

print("\n=== SESSION 2 (new process state, same DB): asking questions ===")
o2 = Orchestrator(NaceConfig(data_dir=DB), provider=MockProvider())
for q in ["What is the Keralan monsoon project codename?",
          "What is the budget code for the monsoon project?",
          "What database does the monsoon project use?"]:
    hits = o2.retriever.search(q, project="monsoon", limit=3)
    answer = hits[0]["content"] if hits else "No record found — I will not invent an answer."
    print(f"Q: {q}\nA: {answer}  [retrieved memory #{hits[0]['id'] if hits else '-'} provenance={hits[0].get('provenance','-') if hits else '-'}]\n")
o2.close()
