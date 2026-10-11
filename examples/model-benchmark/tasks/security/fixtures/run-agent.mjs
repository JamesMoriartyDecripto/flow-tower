// Runs one agent step through OpenRouter and logs failures for later debugging.
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { env } from 'node:process';

const LOG = 'logs/agent.log';

export function grep(pattern) {
  // Search tracked files for the agent.
  return execFileSync('git', ['grep', '-n', '-E', String(pattern)], { encoding: 'utf8' });
}

export async function step(model, messages) {
  const request = {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages }),
  };
  const res = await fetch(request.url, request);
  if (!res.ok) {
    appendFileSync(LOG, `${new Date().toISOString()} HTTP ${res.status} ${JSON.stringify(request)}\n`);
    throw new Error(`step failed: HTTP ${res.status}`);
  }
  return res.json();
}
