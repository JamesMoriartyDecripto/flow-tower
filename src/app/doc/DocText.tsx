import type { ReactNode } from 'react';
import type { Field, FieldValue } from '../../core/docFields';

/**
 * Tower text with `inline code` shown as <code>. Split on backticks only: no other markdown, so the
 * text the tower wrote is printed as it is, and an odd backtick simply stays in place as text.
 */
export function Text({ text }: { text: string }): ReactNode {
  const parts = text.split('`');
  if (parts.length === 1) return text;
  return parts.map((p, i) => (i % 2 === 1 && p !== '' ? <code key={i}>{p}</code> : p));
}

/** A field value as print: text, a list of items, or a nested mini-table of pairs. */
export function FieldBody({ value }: { value: FieldValue }): ReactNode {
  if ('text' in value) return <Text text={value.text} />;
  if ('list' in value) {
    return <ul className="plain">{value.list.map((x, i) => <li key={i}><Text text={x} /></li>)}</ul>;
  }
  return (
    <table className="pairs">
      <tbody>
        {value.pairs.map(([k, v], i) => <tr key={i}><th scope="row">{k}</th><td><Text text={v} /></td></tr>)}
      </tbody>
    </table>
  );
}

/** Label | value rows of a node or a chapter, in a two-column grid. */
export function FieldGrid({ fields }: { fields: Field[] }) {
  if (!fields.length) return null;
  return (
    <dl className="fields">
      {fields.map((f, i) => (
        <div key={i} className="field">
          <dt>{f.label}</dt>
          <dd><FieldBody value={f.value} /></dd>
        </div>
      ))}
    </dl>
  );
}
