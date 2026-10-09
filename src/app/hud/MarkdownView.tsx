import Markdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parse as parseYaml } from 'yaml';

/** Leading YAML frontmatter (agent and command files): shown as a small table, not as Markdown. */
function splitFrontmatter(source: string): { meta?: Record<string, unknown>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!m) return { body: source };
  try {
    const meta = parseYaml(m[1]);
    return meta && typeof meta === 'object' && !Array.isArray(meta) ? { meta: meta as Record<string, unknown>, body: source.slice(m[0].length) } : { body: source };
  } catch {
    return { body: source };
  }
}

/**
 * Formatted view of a Markdown file. Files can come from a cloned third-party repository, so nothing
 * is injected as HTML: react-markdown builds React elements and ignores raw HTML, unsafe URL schemes
 * are dropped, remote images are not fetched (no tracking pixels) and links to other files of the
 * same node open in the viewer instead of the browser.
 */
export function MarkdownView({ source, path, files, onOpen }: { source: string; path: string; files: string[]; onOpen(file: string): void }) {
  const components: Components = {
    a({ href, children }) {
      if (!href) return <span>{children}</span>;
      if (/^(https?:|mailto:)/.test(href)) return <a href={href} target="_blank" rel="noopener noreferrer" title={href}>{children}</a>;
      const target = resolveLink(path, href);
      if (target && files.includes(target)) {
        return <button type="button" className="md-link" onClick={() => onOpen(target)} title={`Open ${target}`}>{children}</button>;
      }
      return <span className="md-dead" title={`${href} (not one of this node's files)`}>{children}</span>;
    },
    img({ alt, src }) {
      return <span className="md-img" title={src ? `Image not loaded: ${src}` : undefined}>[image{alt ? `: ${alt}` : ''}]</span>;
    },
  };
  const { meta, body } = splitFrontmatter(source);
  return (
    <div className="md-view">
      {meta && (
        <dl className="md-meta">
          {Object.entries(meta).map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{typeof v === 'string' ? v : JSON.stringify(v)}</dd></div>
          ))}
        </dl>
      )}
      <Markdown remarkPlugins={[remarkGfm]} components={components} urlTransform={(url) => defaultUrlTransform(url)} skipHtml>{body}</Markdown>
    </div>
  );
}

/** "docs/a.md" + "../README.md#x" → "README.md" (relative to the node's root, like `files`). */
export function resolveLink(from: string, href: string): string | undefined {
  const clean = href.split('#')[0].split('?')[0];
  if (!clean || clean.startsWith('/')) return undefined;
  const parts = from.split('/').slice(0, -1);
  for (const seg of clean.split('/')) {
    if (seg === '..') { if (!parts.length) return undefined; parts.pop(); } else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}
