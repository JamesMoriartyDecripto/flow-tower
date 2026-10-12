import '@fontsource/orbitron/800.css';

/*
 * The Flow Tower mark, as in the app's top bar: the three-stroke icon (the favicon) and the wordmark
 * FLOW//TOWER with the // in the accent. The wordmark stays real text, so it is selectable and searchable
 * in the PDF. The document page does not load the app's fonts, so the Orbitron weight is imported here.
 */
export function Mark({ size }: { size: 'sm' | 'lg' }) {
  return (
    <span className={`mark mark-${size}`}>
      <svg className="mark-icon" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M6 8h20M6 16h20M6 24h20" fill="none" stroke="currentColor" strokeWidth={2} />
      </svg>
      <span className="mark-word">FLOW<b>//</b>TOWER</span>
    </span>
  );
}
