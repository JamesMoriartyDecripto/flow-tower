import type { ReactNode } from 'react';

/**
 * The card every overview chart sits in: a hairline frame, the title and its one-line note above the drawing,
 * and a column span of 6 or 12 on the overview grid. The title is the first child of the figure's caption, so
 * every card reads the same way: title, note, then the chart. The figure keeps `data-chart`, which the checks count.
 */
export function ChartCard({ name, title, note, span = 6, children }: {
  name: string; title: string; note: string; span?: 6 | 12; children: ReactNode;
}) {
  return (
    <figure className={`chart-card span-${span}`} data-chart={name}>
      <figcaption>
        <span className="chart-title">{title}</span>
        <span className="chart-note">{note}</span>
      </figcaption>
      <div className="chart-body">{children}</div>
    </figure>
  );
}
