import { describe, expect, it } from 'vitest';
import { updateCommand } from '../src/server/update';

describe('updateCommand', () => {
  it('prints a plain path unquoted', () => {
    expect(updateCommand('/a/b')).toBe('cd /a/b && git pull && npm install');
  });

  it('quotes a path with a space so it pastes as one word', () => {
    expect(updateCommand('/home/me/My Projects/ft')).toMatch(/^cd '\/home\/me\/My Projects\/ft' && /);
  });
});
