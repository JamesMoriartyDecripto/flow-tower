# Starter towers

Small, complete towers to copy from. Each folder is one `*.tower.yaml` plus the real files it points to.

| Folder | Layers | Pattern |
|---|---|---|
| `single-agent` | 1 | Augmented LLM: one agent looping on a server-side tool |
| `rag-bot` | 2 | Offline ingestion + online retrieval, a guard that checks citations |
| `pr-reviewer` | 3 | CI agent: trigger → review (linter + Claude) → outcome with a human in the loop |
| `voice-assistant` | 3 | On-device audio (openWakeWord, faster-whisper, Piper) around a small Claude agent with local tools |

Run one: `node bin/flow-tower.js examples/starters/rag-bot`. All four as a library: `node bin/flow-tower.js examples/starters`.
