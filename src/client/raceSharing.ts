export type RaceShareResult = 'shared' | 'copied' | 'manual' | 'cancelled';

export async function copyRaceText(value: string): Promise<boolean> {
  if (!window.isSecureContext || typeof navigator.clipboard?.writeText !== 'function') {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export async function shareRaceInvitation(invitation: string): Promise<RaceShareResult> {
  if (window.isSecureContext && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Tectonic 1vs1', text: 'Join my Tectonic race.', url: invitation });
      return 'shared';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }

  return await copyRaceText(invitation) ? 'copied' : 'manual';
}
