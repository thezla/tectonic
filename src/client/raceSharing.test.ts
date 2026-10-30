import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { copyRaceText, shareRaceInvitation } from './raceSharing.js';

const invitation = 'https://puzzle.example/play/?join=ABCD';
const writeText = vi.fn<(value: string) => Promise<void>>();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('window', { isSecureContext: true });
  vi.stubGlobal('navigator', { clipboard: { writeText } });
});

afterEach(() => vi.unstubAllGlobals());

describe('copyRaceText', () => {
  it.each(['ABCD', invitation])('copies only the requested code or link: %s', async (value) => {
    expect(await copyRaceText(value)).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(value);
  });

  it('does not attempt clipboard access on insecure LAN pages', async () => {
    vi.stubGlobal('window', { isSecureContext: false });
    expect(await copyRaceText('ABCD')).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it.each([{}, { clipboard: {} }])('offers manual copying when the clipboard API is missing', async (browser) => {
    vi.stubGlobal('navigator', browser);
    expect(await copyRaceText('ABCD')).toBe(false);
  });

  it('offers manual copying if permission is denied', async () => {
    writeText.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    expect(await copyRaceText('ABCD')).toBe(false);
  });
});

describe('shareRaceInvitation', () => {
  it('uses the native share sheet without also copying to the clipboard', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });
    expect(await shareRaceInvitation(invitation)).toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({
      title: 'Tectonic 1vs1', text: 'Join my Tectonic race.', url: invitation,
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the invitation when native sharing is unavailable', async () => {
    expect(await shareRaceInvitation(invitation)).toBe('copied');
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(invitation);
  });

  it('copies the invitation if native sharing fails', async () => {
    const share = vi.fn().mockRejectedValue(new Error('Sharing unavailable'));
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });
    expect(await shareRaceInvitation(invitation)).toBe('copied');
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(invitation);
  });

  it('respects a canceled share sheet without copying unexpectedly', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Canceled', 'AbortError'));
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });
    expect(await shareRaceInvitation(invitation)).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('offers manual copying if both native sharing and clipboard access fail', async () => {
    const share = vi.fn().mockRejectedValue(new Error('Sharing unavailable'));
    writeText.mockRejectedValue(new Error('Clipboard unavailable'));
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });
    expect(await shareRaceInvitation(invitation)).toBe('manual');
  });

  it('offers manual copying if neither API is available', async () => {
    vi.stubGlobal('navigator', {});
    expect(await shareRaceInvitation(invitation)).toBe('manual');
  });

  it('does not call native sharing or the clipboard on an insecure page', async () => {
    const share = vi.fn();
    vi.stubGlobal('window', { isSecureContext: false });
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });
    expect(await shareRaceInvitation(invitation)).toBe('manual');
    expect(share).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });
});
