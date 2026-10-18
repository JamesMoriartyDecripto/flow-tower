/*
 * The table shape the file viewer uses for databases and SQL schema files, and a tolerant parser that
 * reads the tables and views out of a schema file. Pure on purpose: it runs in the browser as well as
 * on the server, so it imports nothing from node:.
 */

export interface DbColumn { name: string; type: string; pk: boolean; notNull: boolean; references?: string }
export interface DbTable {
  name: string;
  kind: 'table' | 'view';
  columns: DbColumn[];
  rowCount?: number;
  /** True when the count reached its cap, so rowCount is a floor, not the real total. */
  rowCountCapped?: boolean;
  /** How many columns were left out of the preview because the table is too wide. */
  columnsCut?: number;
  rows?: DbCell[][];
}
export type DbCell = string | number | null;
export interface DbPreview { source: 'sqlite' | 'sql'; tables: DbTable[]; tableCount?: number }

/** Bounds on the SQL parser: a generated or hostile schema must not make the viewer spend forever. */
const MAX_STATEMENTS = 1_000;
const MAX_COLUMNS = 500;

/*
 * One identifier: a bare word, or a "double", `backtick` or [bracket] quoted one, optionally dotted
 * (public.plants). Bare words stop at dots, spaces and punctuation so the name ends where the column list
 * or the body starts.
 */
const NAME = /(?:"[^"]*"|`[^`]*`|\[[^\]]*\]|[^\s."`\[(),;]+)(?:\s*\.\s*(?:"[^"]*"|`[^`]*`|\[[^\]]*\]|[^\s."`\[(),;]+))*/;
// Sticky patterns: they match at lastIndex, so the parser never slices the rest of the text per statement.
const NAME_AT = new RegExp(NAME.source, 'y');
const SPACE_AT = /\s*/y;
const CREATE = /\bcreate\s+(?:or\s+replace\s+)?(?:(?:global\s+|local\s+)?(?:temp|temporary|unlogged)\s+)?(table|view)\s+(?:if\s+not\s+exists\s+)?/gi;
/*
 * A table item is a constraint only when it starts with CONSTRAINT or with the keyword in a constraint form:
 * `check (`, `unique (`, `exclude (`, `primary key`, `foreign key`. A column may be named `check` or `unique`
 * (`unique integer`), so a bare keyword does not make the item a constraint.
 */
const CONSTRAINT_START = /^(?:constraint\b|(?:primary|foreign)\s+key\b|(?:check|unique|exclude)\s*\()/i;
const TYPE_STOP = /\b(primary|not|null|default|references|check|unique|constraint|generated|collate|as)\b/gi;
const REFERENCES = new RegExp(`\\breferences\\s+(${NAME.source})\\s*(?:\\(([^)]*)\\))?`, 'i');
const FOREIGN_KEY = new RegExp(`^foreign\\s+key\\s*\\(([^)]*)\\)\\s*references\\s+(${NAME.source})\\s*(?:\\(([^)]*)\\))?`, 'i');
const PRIMARY_KEY = /^primary\s+key\s*\(([^)]*)\)/i;

/*
 * A table constraint may open with a name: `CONSTRAINT a_pkey PRIMARY KEY (id)`. The name is dropped before the
 * constraint patterns run, since they are anchored at the keyword; the name itself can be quoted in any of the
 * three styles the identifier pattern accepts.
 */
const CONSTRAINT_NAME = /^constraint\s+(?:"[^"]*"|`[^`]*`|\[[^\]]*\]|[^\s"`\[(),;]+)\s*/i;

/** Removes the quotes around one identifier part: "x", `x` and [x] all become x. */
const unquote = (s: string) => s.trim().replace(/^["`\[]|["`\]]$/g, '');

/** Splits a dotted name into unquoted parts, so `"my table"` and `public.plants` both come out right. */
const nameOf = (raw: string) => (raw.match(/"[^"]*"|`[^`]*`|\[[^\]]*\]|[^.\s]+/g) ?? []).map(unquote).join('.');

/*
 * Blanks out the inside of single-quoted strings and drops comments, before anything else looks at the
 * text. Doing it first means a "--" or a parenthesis inside a default value never reads as structure.
 * The quote characters stay, so the text keeps its shape; a doubled quote ('it''s') just toggles twice.
 */
function maskSql(sql: string): string {
  let out = '';
  let inStr = false;
  for (let i = 0; i < sql.length; ) {
    const c = sql[i];
    if (inStr) {
      if (c === "'") inStr = false;
      out += c === "'" ? c : '_';
      i++;
    } else if (c === "'") {
      inStr = true;
      out += c;
      i++;
    } else if (sql.startsWith('--', i)) {
      // Stop at the newline and keep it, so the next line still starts a new statement.
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl;
    } else if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2);
      out += ' ';
      i = end === -1 ? sql.length : end + 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Index of the parenthesis that closes the one at `open`, or -1 when the body never closes. */
function closeIndex(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

/** Splits a table body on top-level commas only, so `numeric(10, 2)` and `check (x in ('a', 'b'))` stay whole. */
function splitItems(body: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of body) {
    if (c === '(') depth++;
    else if (c === ')') depth--;
    if (c === ',' && depth === 0) {
      items.push(cur);
      cur = '';
    } else cur += c;
  }
  items.push(cur);
  return items.map((s) => s.trim()).filter((s) => s.length > 0);
}

/*
 * Where the type of a column ends: the first constraint keyword outside parentheses (or the end of the item).
 * The depth is carried forward from match to match, so the scan is linear in the item, not one rescan per keyword.
 */
function typeEnd(rest: string): number {
  let depth = 0;
  let pos = 0;
  for (const m of rest.matchAll(TYPE_STOP)) {
    const at = m.index!;
    for (; pos < at; pos++) {
      if (rest[pos] === '(') depth++;
      else if (rest[pos] === ')') depth--;
    }
    if (depth === 0) return at;
  }
  return rest.length;
}

/** One column definition: name, type, and the inline constraints it carries. */
function columnOf(item: string): DbColumn | null {
  const head = /^(?:"[^"]*"|`[^`]*`|\[[^\]]*\]|[^\s"`\[]+)/.exec(item);
  if (!head) return null;
  const rest = item.slice(head[0].length);
  const pk = /\bprimary\s+key\b/i.test(item);
  const col: DbColumn = {
    name: unquote(head[0]),
    type: rest.slice(0, typeEnd(rest)).trim().replace(/\s+/g, ' '),
    pk,
    notNull: pk || /\bnot\s+null\b/i.test(item),
  };
  const ref = REFERENCES.exec(item);
  if (ref) {
    const refCol = ref[2] ? unquote(ref[2].split(',')[0]) : '';
    col.references = refCol ? `${nameOf(ref[1])}.${refCol}` : nameOf(ref[1]);
  }
  return col;
}

/** Parses one CREATE TABLE body into its columns, applying the table-level key constraints as it goes. */
function tableOf(name: string, body: string): DbTable {
  const columns: DbColumn[] = [];
  const constraints: string[] = [];
  for (const item of splitItems(body)) {
    if (CONSTRAINT_START.test(item)) constraints.push(item);
    else if (columns.length < MAX_COLUMNS) {
      const col = columnOf(item);
      if (col) columns.push(col);
    }
  }
  const byName = (n: string) => columns.find((c) => c.name === n);
  for (const raw of constraints) {
    const item = raw.replace(CONSTRAINT_NAME, '');
    const pk = PRIMARY_KEY.exec(item);
    if (pk) {
      for (const n of pk[1].split(',')) {
        const col = byName(unquote(n));
        if (col) {
          col.pk = true;
          col.notNull = true;
        }
      }
      continue;
    }
    const fk = FOREIGN_KEY.exec(item);
    if (fk) {
      const locals = fk[1].split(',').map(unquote);
      const refCols = fk[3] ? fk[3].split(',').map(unquote) : [];
      const refTable = nameOf(fk[2]);
      locals.forEach((n, i) => {
        const col = byName(n);
        if (col) col.references = refCols[i] ? `${refTable}.${refCols[i]}` : refTable;
      });
    }
  }
  return { name, kind: 'table', columns };
}

/**
 * Reads the CREATE TABLE and CREATE VIEW statements out of a SQL file, in file order. Tolerant: anything
 * it does not recognise is skipped, and an unclosed body is dropped, so a broken file gives [] instead
 * of an error. Views carry no columns, since the parser does not read a SELECT list.
 */
export function parseSqlSchema(sql: string): DbTable[] {
  try {
    const text = maskSql(sql);
    const tables: DbTable[] = [];
    let statements = 0;
    for (const m of text.matchAll(CREATE)) {
      if (++statements > MAX_STATEMENTS) break;
      const start = m.index! + m[0].length;
      NAME_AT.lastIndex = start;
      const nm = NAME_AT.exec(text);
      if (!nm) continue;
      const name = nameOf(nm[0]);
      SPACE_AT.lastIndex = start + nm[0].length;
      SPACE_AT.exec(text);
      const pos = SPACE_AT.lastIndex;
      if (m[1].toLowerCase() === 'view') {
        tables.push({ name, kind: 'view', columns: [] });
        continue;
      }
      if (text[pos] !== '(') continue;
      const close = closeIndex(text, pos);
      if (close === -1) continue;
      tables.push(tableOf(name, text.slice(pos + 1, close)));
    }
    return tables;
  } catch {
    // The parser is tolerant by design; this is a last line of defence so a viewer never crashes on a file.
    return [];
  }
}
