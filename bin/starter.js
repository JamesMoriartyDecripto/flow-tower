// The tower `flow-tower init` writes: a minimal, valid example to edit. Kept apart from flow-tower.js,
// which is over the repo's file-length rule.
export const STARTER = `# yaml-language-server: $schema=https://raw.githubusercontent.com/JamesMoriartyDecripto/flow-tower/main/schema/flow-tower.schema.json
version: 1
name: My Agent
prompts:
  main: { text: "You are a helpful agent. Task: {{task}}" }
agents:
  main: { model: claude-sonnet-5-5, prompt: main, tools: [search] }
layers:
  - id: flow
    title: Agent Loop
    nodes:
      - { id: input, type: entry, label: User input }
      - { id: agent, agent: main, label: Agent }
      - { id: done, type: decision, label: Done? }
      - { id: answer, type: output, label: Answer }
    edges:
      - input -> agent
      - agent -> done
      - "done -> agent [return]: no"
      - "done -> answer: yes"
  - id: tools
    title: Tools
    nodes:
      - { id: search, type: tool, label: Web search }
links:
  - flow.agent -> tools.search [call]
`;
