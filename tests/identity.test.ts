import { describe, expect, it } from 'vitest';
import { identityFromAttributes, tokenAttr } from '../src/core/identity';

describe('identityFromAttributes', () => {
  // One rung per cascade: each case only sets the attribute under test.
  it('resolves user, host, runtime, project and session', () => {
    expect(identityFromAttributes({ 'enduser.id': 'u1' }).user).toBe('u1');
    expect(identityFromAttributes({ 'user.email': 'a@b.c' }).user).toBe('a@b.c');
    expect(identityFromAttributes({ 'user.account_uuid': 'acc' }).user).toBe('acc');
    expect(identityFromAttributes({ 'user.id': 'id1' }).user).toBe('id1');

    expect(identityFromAttributes({ 'host.name': 'h1' }).host).toBe('h1');
    expect(identityFromAttributes({ 'faas.name': 'fn' }).host).toBe('fn');
    expect(identityFromAttributes({ 'container.name': 'c1' }).host).toBe('c1');
    expect(identityFromAttributes({ 'cloud.instance.id': 'i-1' }).host).toBe('i-1');

    expect(identityFromAttributes({ 'service.name': 'codex' }).runtime).toBe('codex');

    expect(identityFromAttributes({ project: 'proj' }).project).toBe('proj');
    expect(identityFromAttributes({ 'service.namespace': 'ns' }).project).toBe('ns');
    expect(identityFromAttributes({ 'vcs.repository.url.full': 'https://x/y/flow-tower.git' }).project).toBe('flow-tower');
    expect(identityFromAttributes({ 'vcs.repository.name': 'flow-tower' }).project).toBe('flow-tower');

    expect(identityFromAttributes({ 'session.id': 's1' }).session).toBe('s1');
    expect(identityFromAttributes({ 'conversation.id': 'c1' }).session).toBe('c1');
    expect(identityFromAttributes({ 'gen_ai.conversation.id': 'g1' }).session).toBe('g1');
  });

  it('prefers the earlier rung of each cascade', () => {
    const id = identityFromAttributes({
      'enduser.id': 'u', 'user.email': 'x', 'user.id': 'y',
      'host.name': 'h', 'faas.name': 'f',
      project: 'p', 'service.namespace': 'n',
      'session.id': 's', 'conversation.id': 'c',
    });
    expect(id).toEqual(expect.objectContaining({ user: 'u', host: 'h', project: 'p', session: 's' }));
  });

  it('appends where it ran to the runtime when available', () => {
    expect(identityFromAttributes({ 'service.name': 'claude-code', 'cloud.platform': 'aws' }).runtime).toBe('claude-code/aws');
    expect(identityFromAttributes({ 'service.name': 'codex', 'faas.name': 'lambda' }).runtime).toBe('codex/lambda');
    expect(identityFromAttributes({ 'service.name': 'codex', 'deployment.environment.name': 'prod' }).runtime).toBe('codex/prod');
    expect(identityFromAttributes({ 'cloud.platform': 'aws' }).runtime).toBeUndefined();
  });

  it('keeps Claude user.id only as the very last fallback', () => {
    // Claude's user.id is an anonymous install id, so a real account id wins.
    expect(identityFromAttributes({ 'service.name': 'claude-code', 'user.id': 'anon', 'user.email': 'a@b.c' }).user).toBe('a@b.c');
    // ...but with nothing better, it is still better than nothing.
    expect(identityFromAttributes({ 'service.name': 'claude-code', 'user.id': 'anon' }).user).toBe('anon');
    expect(identityFromAttributes({ 'service.name': 'claude-code-desktop', 'user.id': 'anon' }).user).toBe('anon');
    // For non-Claude runtimes user.id is a real identity, so it is not demoted.
    expect(identityFromAttributes({ 'service.name': 'codex', 'user.id': 'acct', 'user.email': 'a@b.c' }).user).toBe('a@b.c');
  });
});

describe('tokenAttr', () => {
  it('accepts old and new attribute names', () => {
    expect(tokenAttr({ 'gen_ai.usage.input_tokens': 1 }, 'input')).toBe(1);
    expect(tokenAttr({ 'gen_ai.usage.prompt_tokens': 2 }, 'input')).toBe(2);
    expect(tokenAttr({ input_tokens: 3 }, 'input')).toBe(3);

    expect(tokenAttr({ 'gen_ai.usage.output_tokens': 4 }, 'output')).toBe(4);
    expect(tokenAttr({ 'gen_ai.usage.completion_tokens': 5 }, 'output')).toBe(5);
    expect(tokenAttr({ output_tokens: 6 }, 'output')).toBe(6);

    expect(tokenAttr({ 'gen_ai.usage.cache_read.input_tokens': 7 }, 'cache_read')).toBe(7);
    expect(tokenAttr({ 'gen_ai.usage.cache_read_input_tokens': 8 }, 'cache_read')).toBe(8);
    expect(tokenAttr({ cache_read_tokens: 9 }, 'cache_read')).toBe(9);
    expect(tokenAttr({ cache_read_input_tokens: 10 }, 'cache_read')).toBe(10);

    expect(tokenAttr({ 'gen_ai.usage.cache_write.input_tokens': 11 }, 'cache_write')).toBe(11);
    expect(tokenAttr({ 'gen_ai.usage.cache_creation.input_tokens': 12 }, 'cache_write')).toBe(12);
    expect(tokenAttr({ 'gen_ai.usage.cache_creation_input_tokens': 13 }, 'cache_write')).toBe(13);
    expect(tokenAttr({ cache_creation_tokens: 14 }, 'cache_write')).toBe(14);
    expect(tokenAttr({ cache_creation_input_tokens: 15 }, 'cache_write')).toBe(15);
  });

  it('coerces numeric strings and ignores junk', () => {
    expect(tokenAttr({ input_tokens: '42' }, 'input')).toBe(42);
    expect(tokenAttr({ input_tokens: 'nope' }, 'input')).toBeUndefined();
    expect(tokenAttr({ input_tokens: '' }, 'input')).toBeUndefined();
    expect(tokenAttr({ input_tokens: null }, 'input')).toBeUndefined();
    expect(tokenAttr({}, 'output')).toBeUndefined();
  });
});
