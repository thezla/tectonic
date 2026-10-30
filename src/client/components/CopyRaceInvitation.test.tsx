import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CopyRaceInvitation } from './CopyRaceInvitation.js';

describe('room invitation actions', () => {
  it('renders separate copy-code and share-link actions without exposing player credentials', () => {
    const markup = renderToStaticMarkup(<CopyRaceInvitation roomCode="ABCD" />);
    expect(markup.match(/<button type="button"/g)).toHaveLength(2);
    expect(markup).toContain('Copy code');
    expect(markup).toContain('Share link');
    expect(markup).toContain('role="status" aria-live="polite" aria-atomic="true"');
    expect(markup).not.toContain('disabled');
    expect(markup).not.toContain('<input');
    expect(markup).not.toContain('playerId');
  });
});
