import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownView, resolveLink } from '../src/app/hud/MarkdownView';

/** Markdown files can come from a cloned third-party repository: the formatted view must stay inert. */
const render = (source: string, files: string[] = []) =>
  renderToStaticMarkup(createElement(MarkdownView, { source, path: 'docs/guide.md', files, onOpen: () => undefined }));

describe('formatted Markdown view', () => {
  it('never renders raw HTML, scripts or javascript: links', () => {
    const html = render('# Title\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[click](javascript:alert(1))\n\n<a href="javascript:alert(2)">x</a>');
    // Raw HTML is dropped (skipHtml), not even shown as text; the javascript: link loses its href.
    expect(html).not.toMatch(/<script|<img|<a href|onerror|javascript:/i);
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<span>click</span>');
  });

  it('does not load remote images, opens external links in a new tab, and links sibling files in the viewer', () => {
    const html = render('![chart](https://tracker.example.com/p.png)\n\n[docs](https://example.com)\n\n[setup](../README.md#install)\n\n[gone](missing.md)', ['README.md']);
    expect(html).not.toContain('<img');
    expect(html).toContain('[image: chart]');
    expect(html).toContain('href="https://example.com" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain('class="md-link"');
    expect(html).toContain('class="md-dead"');
  });

  it('renders GitHub tables and shows frontmatter as metadata', () => {
    const html = render('---\nname: reviewer\ntools: [Read, Grep]\n---\n| a | b |\n|---|---|\n| 1 | 2 |\n');
    expect(html).toContain('<table>');
    expect(html).toContain('<dt>name</dt><dd>reviewer</dd>');
    expect(html).not.toContain('<hr');
  });

  it('resolves relative links from the file being viewed', () => {
    expect(resolveLink('docs/guide.md', '../README.md#install')).toBe('README.md');
    expect(resolveLink('docs/guide.md', './img/a.md')).toBe('docs/img/a.md');
    expect(resolveLink('guide.md', '../../etc/passwd')).toBeUndefined();
    expect(resolveLink('guide.md', '/abs.md')).toBeUndefined();
  });
});
