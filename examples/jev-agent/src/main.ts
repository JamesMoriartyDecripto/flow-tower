// Entry point: `npm start -- "<request>"`. Wires the decision points in order:
// route (Jev) -> act loop (LLM + Jev gates) -> Stop hook (Jev) -> result or escalation.
import type Anthropic from '@anthropic-ai/sdk';
import { argv, exit } from 'node:process';
import { route } from './route.ts';
import { actLoop } from './loop.ts';
import { browse } from './browser.ts';
import { judgeStop } from './hooks/stop.ts';
import { logOutcome } from './judgments.ts';

const request = argv.slice(2).join(' ');
const { route: worker, reason } = await route(request);

if (worker === 'ask_user') {
  console.log(`Need more detail before starting (${reason}). Which repo, file or environment is this about?`);
  exit(0);
}
if (worker === 'browser') {
  const url = request.match(/https?:\/\/\S+/)?.[0] ?? 'about:blank';
  const out = await browse(request, url);
  console.log(out.text);
  exit(out.ok ? 0 : 1);
}

let messages: Anthropic.MessageParam[] = [{ role: 'user', content: request }];
let blocks = 0;
for (;;) {
  const run = await actLoop(request, worker, messages);
  messages = run.messages;
  if (run.status !== 'stop_requested') {
    console.log(`Escalating to a human (${run.status}). Transcript kept for review.`);
    logOutcome('next_action', run.status, 'run');
    exit(1);
  }
  const last = messages.at(-1)!;
  const finalMessage = Array.isArray(last.content) ? last.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n') : last.content;
  const toolCalls = messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).flatMap((b) => (b.type === 'tool_use' ? [`${b.name} ${JSON.stringify(b.input).slice(0, 200)}`] : []));
  const verdict = await judgeStop({ request, final_message: finalMessage, tool_calls: toolCalls.slice(-30), blocks_this_turn: blocks });
  if (!verdict.block) {
    console.log(finalMessage);
    for (const a of verdict.advisories) console.log(`note: ${a}`);
    exit(0);
  }
  blocks++;
  messages.push({ role: 'user', content: verdict.nudge }); // fixed nudge, then the loop resumes
}
