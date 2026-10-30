import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SoloCompletion } from './SoloCompletion.js';

describe('SoloCompletion', () => {
  it('renders a compact celebration, readable elapsed, and native Play again action', () => {
    const markup = renderToStaticMarkup(<SoloCompletion completed elapsedMs={125999} onPlayAgain={() => {}} />);
    expect(markup).toContain('Puzzle solved!');
    expect(markup).toContain('Completed in 2m 5s');
    expect(markup).toContain('<button type="button">Play again</button>');
    expect(markup).toContain('role="status" aria-live="polite" aria-atomic="true"');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('keeps the announcement region mounted but empty before a genuine completion', () => {
    const markup = renderToStaticMarkup(<SoloCompletion completed={false} elapsedMs={1000} onPlayAgain={() => {}} />);
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain('Puzzle solved!');
    expect(markup).not.toContain('Play again');
    expect(markup).not.toContain('<button');
  });
});
