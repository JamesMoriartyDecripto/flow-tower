"""Host-side configuration. Secrets come from the host environment only."""
from os import environ

MONGO_URI = environ["MONGO_URI"]            # Atlas user with the fraud-desk-host role
DB_NAME = "fraud_review_demo"
MODEL = environ.get("COOKBOOK_MODEL", "claude-haiku-5-5")

VECTOR_INDEX_NAME = "transactions_vector"
SEARCH_INDEX_NAME = "transactions_text"
LEXICAL_PATHS = ["text", "merchant.name", "memo"]
EMBED_DIM = 1024                            # voyage-3.5 default output dimension
DECIDED_STATUSES = ["approved", "rejected"]

ENABLE_RERANK = environ.get("ENABLE_RERANK") == "1"
RERANK_FANOUT = 5
RING_MAX_DEPTH = 4
BATCH_SIZE = 20                             # pending ids per session kickoff
