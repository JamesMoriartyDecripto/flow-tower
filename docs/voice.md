# Voice

Voice commands, the voice agent, learning from sessions, and where your personal data, keys and tokens live (the user folder, `FLOW_TOWER_HOME`). Read it to use or change voice; for keyboard controls see the [README](../README.md#controls), for hub config see [command-center.md](command-center.md#configuration-file).

Press **V** or the **MIC** button (top bar or library header) and say where to go. When you stop speaking (about 0.6 s of silence), the browser sends the clip to the local server, which has it transcribed; the command is then matched in the page. A caption under the top bar shows what it heard and what it did.

**Setup.** Voice needs an [OpenRouter](https://openrouter.ai) API key. Put `OPENROUTER_API_KEY=...` in `~/.config/flow-tower/.env`, your own folder outside every repo (see [where your data lives](#where-your-data-lives)), or export it in your shell, then restart Flow Tower. The `.env` file in the flow-tower folder (git-ignored) still works as a fallback. The environment wins, then the user folder, then the repo folder. The key stays on the local server and never reaches the page. The online demo has no server, so it has no voice.

**Language.** Settings → Voice → Spoken language: Auto (detected from each clip), Italiano or English. Picking yours helps short commands. Command words forgive a misheard letter, and "vista …" / "… view" means the map unless you say tower.

| Italian | English | Does |
|---|---|---|
| "apri dev squad" | "open dev squad" | Open a project |
| "livello 3", "il terzo livello", "ultimo livello" | "layer 3", "third layer", "last layer" | Focus a layer by number |
| "livello memoria" | "memory layer" | Focus a layer by name |
| "vai al nodo triage", "agente reviewer" | "node triage", "agent reviewer" | Select a node or an agent |
| "vista mappa", "vista torre" | "map view", "tower view" | Switch view |
| "panoramica" | "overview" | The whole tower |
| "indietro" | "back" | Go back, like Esc |
| "libreria" | "library" | Project library |
| "chiudi il file" | "close the file" | Closes only the viewer (the node stays selected) |
| "apri il suo file", "apri il file 2" | "open its file", "open the second file" | Open file N of the selected node (1 = first) |
| "il prossimo", "il precedente" | "next", "previous" | Move one step through what you are on: the viewer's files, the last list shown, or the layer's nodes |
| "file successivo", "file precedente" | "next file", "previous file" | Move one step through the open viewer's files only |
| "scorri giù", "scorri su", "vai in fondo", "vai all'inizio" | "scroll down", "scroll up", "go to the bottom", "go to the top" | Page the file open in the viewer, or jump to its top or bottom |
| "apri l'hub", "mostra le macchine", "chiudi l'hub" | "open the hub", "show the machines", "close the hub" | Open the Hub panel (Now or Machines), or close it |
| "mostra solo gli agenti", "mostra tutto" | "show only agents", "show everything" | Show only the named node types (Italian: agente, strumento, modello, decisione, umano, guardia, hook, ingresso, uscita, memoria, processo; English: agent, tool, model, decision, human, guard, hook, entry, output, memory, process), or every type again |
| "spegni il microfono" | "stop listening" | Microphone off |

A name alone works too ("triage"). Names come from what is on screen: projects, layers, nodes and agents. They match loosely, so a misheard word still finds its target. When a name fits several things, the caption numbers them: say "il primo" or "two" to pick. "Entra" / "enter" opens the selected node's sub-tower, "chiudi" / "close" closes the panel. Listening stops by itself after 2 minutes without a command.

"apri il suo file" / "open its file", "il prossimo" / "next", "il precedente" / "previous", "file successivo" / "next file", the scroll, hub and "mostra solo …" / "show only …" phrases are whole fixed phrases: they are handled by the local parser even when the voice agent is on, so "chiudi il file" closes the viewer, "il prossimo" steps through files, lists or layer nodes, and "mostra solo gli agenti" filters without a model call.

**Noise.** The microphone tells a voice from a fan by the shape of the sound, not only its loudness, after measuring the room in its first 0.7 s. If a laptop fan still starts clips by itself, set **Settings → Voice → Microphone sensitivity** to Low and speak a little louder; High suits quiet rooms and soft voices. A transcript that is only "Grazie." or "Thank you." is what the recognizer writes for noise, so it is ignored.

**Privacy.** Only clips with speech are sent (silence is dropped), only while the microphone is on. They go to OpenRouter (`openai/whisper-large-v3-turbo`), routed only to providers with zero data retention (`provider.zdr`). Commands are matched locally; no tower content is sent. Nothing else leaves your machine. `FLOW_TOWER_VOICE_MODEL` picks another model; `FLOW_TOWER_VOICE_ZDR=0` drops the zero-retention requirement.

**Cost.** OpenRouter bills speech-to-text per second of audio. A command is a second or two, a fraction of a cent. Measured once (illustrative): an Italian command was transcribed in about 1.2 s for about $0.000005.

**Browsers.** Firefox, Chrome, Safari and Edge behave the same: recording uses `MediaRecorder`, not the browser's own speech recognition.

## Talking with the tower

Questions, and anything the commands above do not cover, go to a voice agent that answers out loud in the language you spoke, and shows what it talks about:

| You say | It answers and shows |
|---|---|
| "cosa c'è nel secondo livello?" | the layer's nodes, and focuses it |
| "a cosa è collegato il triage?" | its incoming and outgoing edges, and selects it |
| "fammi vedere i file di questo nodo" → "apri il primo" | how many files there are, and opens the first in the viewer |
| "how many MCP servers are there?" | the count and names, highlighted on screen |
| "what does the fresh verifier do?" | its role, model and tools |

The agent reads the tower on screen through its tools (layers, nodes, connections, files, search) and acts with the same commands as the keyboard, so its answers come from the tower, not from guesses. It keeps the last few exchanges, so "this node" and "the first one" work. Five tools go with the commands in the table above:

- `scroll_file` — page the file open in the viewer, or jump to its top or bottom.
- `hub_panel` — open the Hub panel (Now or Machines), or close it.
- `filter_nodes` — show only the node types you name.
- `library_filter` — open the project library and filter it by words, tag or source (a connected device's name, or this hub).
- `compare_nodes` — two nodes side by side: the fields they share, and the tools only one has.
- `live_status` — what is happening now, from the last 10 minutes of live events: errors, running nodes, the busiest nodes (and, on a hub, the machines running or silent). It selects the node in trouble on the tower on screen. Metadata only: no event messages.

**Interrupting.** While it answers, and for 0.7 s after, the microphone ignores what it hears, so laptop speakers cannot make the agent answer itself. If you speak in that moment just after a reply, the caption says once "Wait a moment after the reply, or press Esc to interrupt it." Stop a reply with **Esc** (the microphone stays on), **V** or **✕** (both turn it off). Esc while the reply is still being written silences the rest of it and stops its tool calls too (the caption says "Stopped"). With headphones, turn on **Settings → Voice → Interrupt by voice**: three words or "stop" then cut the reply short while it is heard; before its first sentence plays, what you say is a normal command.

- **Models** (OpenRouter, zero data retention): `google/gemini-3.5-flash-lite` for the answers and `elevenlabs/eleven-flash-v2.5` for the voice, one voice for every language. Change them with `FLOW_TOWER_AGENT_MODEL`, `FLOW_TOWER_TTS_MODEL` and `FLOW_TOWER_TTS_VOICE`.
- **Settings → Voice → Spoken replies**: off shows the answers in the caption only.
- **Faster first audio (#70).** If the agent has not started its answer 600 ms after you stop speaking, a short cached phrase ("One moment.", "Un attimo.") plays first; first audio drops from 1.9–2.9 s to about 0.6 s.
- **Cost and speed** (measured once on dev-squad, illustrative): an answer took 1.1–2.9 s and about $0.001, and speaking it about 0.7 s more. Plain commands never reach the agent and stay instant.
- **Privacy:** the transcript, what is on screen and the tool results go to the model; no audio is kept. Nothing is logged unless you turn on the journal below.

## Learning from your sessions

Voice can learn from how you use it. It is off by default: turn it on in **Settings → Voice → Learn from my sessions**.

- **What is recorded.** Text only, never audio. One line per turn: what was heard, what happened, and how it went.
- **Outcome marks.** The outcome is corrected from what you do next: "no, the other one" marks the last turn *corrected*, "back" right after marks it *undone*, stopping a reply (Esc, or by voice) marks it *interrupted*.
- **Review.** After 20 new turns, a review runs when the microphone turns off. It costs about a cent with the default model. One runs at a time, and a failed one waits for 20 more turns. **Review now** runs one at any time.
- **Suggestions.** The review proposes aliases for names the recognizer mishears ("triaje" → triage), rules for the agent, and reply style. They change nothing until you accept them in Settings. The caption shows how many are waiting. Accepted rules and style notes are capped at 20 and 2000 characters in all (remove one to accept another), and the agent treats them as preferences: they never override its instructions, the tool results or what is on screen.
- **Forget everything** deletes the journal and all it learned. Each accepted item can also be removed alone.
- **Privacy.** Reviews send journal text to OpenRouter with zero data retention: transcripts and replies, which can quote tower names and file text.

## Where your data lives

Your own things stay in your user folder, never in a repo: `~/.config/flow-tower` (or `FLOW_TOWER_HOME`).

| File | Holds |
|---|---|
| `.env` | `OPENROUTER_API_KEY` |
| `voice-journal.jsonl` | the voice journal (only when learning is on) |
| `voice-memory.json` | accepted aliases and notes, waiting suggestions |
| `config.json` | hub and sender settings: [command-center.md § Configuration file](command-center.md#configuration-file) |
| `tokens.json`, `history.db` | hub tokens (sha256 only) and event history: [hub-reference.md](hub-reference.md#security-model), [realtime.md § History](realtime.md#history) |

Flow Tower creates the folder, the journal and the memory readable by you only (a `FLOW_TOWER_HOME` folder you made yourself keeps its permissions), and rewrites the memory in one step (a crash never leaves half a file). No tower can read this folder or a secret file (key files, credentials, `.ssh`, `.git`…): `/api/file` never serves them, and a prompt `file:`, agent `from:` or nested tower pointing at one is refused by `validate` and the app ("is a secret file or in the user folder: not read"). Symlinks do not get around it: a tower file is checked by its real path before it is read, and folder scans skip links that leave the folder. If `FLOW_TOWER_HOME` points inside the flow-tower folder, the server warns at startup. The `.env` file in the flow-tower folder is only a git-ignored fallback for the key. Nothing personal is written in the repo.

## Troubleshooting

- **Spoken replies crackle on Linux (PipeWire) under load**: rising xruns in `pw-top` mean the graph runs too short a quantum. Workaround: `pw-metadata -n settings 0 clock.force-quantum 2048` (use 4096 after raising `clock.max-quantum`); reset with `pw-metadata -n settings 0 clock.force-quantum 0`.
