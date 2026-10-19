import { describe, expect, it } from 'vitest';
import { agentText, checkQuotes, nodeText } from '../examples/tower-optimizer/scripts/check-quotes.mjs';

const towerText = `version: 1
name: Demo
agents:
  reviewer:
    model: m
    limits: { max_iterations: 12 }
  writer:
    model: w
layers:
  - id: loop
    nodes:
      - { id: reflect, agent: reviewer, label: Reflect }
      - id: draft
        agent: writer
        description: Drafts the text
`;

describe('check-quotes with flow-style nodes and agent fields', () => {
  it('nodeText finds a flow-style node by its id', () => {
    expect(nodeText(towerText, 'loop.reflect')).toContain('label: Reflect');
  });

  it('agentText returns the agent entry and nothing from its neighbours', () => {
    const reviewer = agentText(towerText, 'reviewer');
    expect(reviewer).toContain('max_iterations: 12');
    expect(reviewer).not.toContain('model: w');
    expect(agentText(towerText, 'nobody')).toBeNull();
  });

  it('checkQuotes keeps a quote from the node agent and drops one from another agent', () => {
    const findings = [
      { node: 'loop.reflect', quote: 'max_iterations: 12', rule: 'a' },
      { node: 'loop.draft', quote: 'model: w', rule: 'b' },
      { node: 'loop.draft', quote: 'max_iterations: 12', rule: 'c' },
    ];
    const { kept, dropped } = checkQuotes(towerText, findings);
    expect(kept.map((f) => f.rule)).toEqual(['a', 'b']);
    expect(dropped.map((d) => d.reason)).toEqual(['quote not found in node loop.draft']);
  });
});
