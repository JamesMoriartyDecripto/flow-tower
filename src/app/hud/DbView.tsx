import { useState } from 'react';
import type { DbCell, DbColumn, DbPreview, DbTable } from '../../core/dbPreview';
import './dbView.css';

const SCHEMA_ONLY = 'schema only: no data in a .sql file';

const count = (n: number) => n.toLocaleString('en-US');
const plural = (n: number) => `${count(n)} ${n === 1 ? 'row' : 'rows'}`;
// A capped count is a floor: the "+" says the real total is at least this many.
const rowTotal = (table: DbTable, n: number) => (table.rowCountCapped ? `${count(n)}+ rows` : plural(n));

/** How one cell is shown. NULL gets its own kind so it can be dimmed; numbers are right-aligned. */
export function formatCell(cell: DbCell): { text: string; kind: 'null' | 'number' | 'text' } {
  if (cell === null) return { text: 'NULL', kind: 'null' };
  if (typeof cell === 'number') return { text: String(cell), kind: 'number' };
  return { text: cell, kind: 'text' };
}

/**
 * The row line under the grid. A table without a row list is a .sql schema file (it has no data), so
 * the text says so instead of claiming zero rows. A cut preview says how much of the table it shows.
 */
export function rowsLabel(table: DbTable): string {
  if (!table.rows) return SCHEMA_ONLY;
  const total = table.rowCount ?? table.rows.length;
  if (table.rows.length < total) return `first ${count(table.rows.length)} of ${rowTotal(table, total)}`;
  return rowTotal(table, total);
}

/** The count shown next to a name in the table list: a view gets its word, plus its rows when known. */
function metaLabel(table: DbTable): string {
  const rows = table.rowCount === undefined ? '' : rowTotal(table, table.rowCount);
  if (table.kind === 'view') return rows ? `view · ${rows}` : 'view';
  return rows;
}

/** The footer count of tables. When the file has more tables than the list shows, it says how many are listed. */
export function tablesLabel(db: DbPreview): string {
  const listed = db.tables.length;
  const total = db.tableCount ?? listed;
  if (total > listed) return `first ${count(listed)} of ${count(total)} tables · ${db.source}`;
  return `${total === 1 ? '1 table' : `${count(total)} tables`} · ${db.source}`;
}

/** Tooltip on a column header: the name plus whatever key it carries. */
function headTitle(c: DbColumn): string {
  return [c.name, c.type, c.pk ? 'primary key' : '', c.references ? `references ${c.references}` : '']
    .filter(Boolean)
    .join(' · ');
}

/**
 * Tables and views of a SQLite database or a .sql schema file. The left list picks a table, the right
 * side shows its columns and, for SQLite, its rows. Plain HTML table: the viewer's .code area scrolls it.
 */
export function DbView({ db }: { db: DbPreview }) {
  const [selected, setSelected] = useState(0);
  if (!db.tables.length) return <p className="mono dim db-empty">No tables</p>;
  const index = Math.min(selected, db.tables.length - 1);
  const table = db.tables[index];
  const rows = table.rows ?? [];
  // Views and schema-only tables have no row list, so they get no row line.
  const showRows = !!table.rows || db.source === 'sql';
  // A .sql file has no rows, so its columns read better as one line each than as an empty grid.
  const schemaOnly = db.source === 'sql';

  return (
    <div className="db-view">
      <nav className="db-tables" aria-label="Tables">
        {db.tables.map((t, i) => (
          <button key={`${t.kind}:${t.name}`} type="button" className={i === index ? 'on' : ''} aria-pressed={i === index} onClick={() => setSelected(i)}>
            <span className="db-name">{t.name}</span>
            <span className="db-meta">{metaLabel(t)}</span>
          </button>
        ))}
      </nav>
      <div className="db-data">
        {schemaOnly ? (
          <table className="db-grid db-columns">
            <thead>
              <tr>
                <th>Column</th>
                <th>Type</th>
                <th>Key</th>
                <th>Not null</th>
                <th>References</th>
              </tr>
            </thead>
            <tbody>
              {table.columns.map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td className="dim">{c.type}</td>
                  <td>{c.pk ? 'PK' : ''}</td>
                  <td>{c.notNull ? '✓' : ''}</td>
                  <td>{c.references ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="db-grid">
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <th key={c.name} title={headTitle(c)}>
                    <span className="db-col">
                      {c.name}
                      {c.pk && <span className="db-pk">PK</span>}
                      {c.references && <span className="db-ref">→ {c.references}</span>}
                    </span>
                    <span className="db-type">{c.type}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => {
                    const f = formatCell(cell);
                    // The full value goes in the title: the cell itself is cut with an ellipsis.
                    return (
                      <td key={c} className={f.kind} title={f.kind === 'text' ? f.text : undefined}>
                        <span className="db-cell">{f.text}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {table.columnsCut ? <p className="db-note">{count(table.columnsCut)} more columns not shown</p> : null}
        {showRows && <p className="db-note">{rowsLabel(table)}</p>}
      </div>
    </div>
  );
}
