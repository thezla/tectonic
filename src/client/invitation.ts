export function createRaceInvitation(location: string, roomCode: string): string {
  const currentUrl = new URL(location);
  if (currentUrl.protocol !== 'https:' && currentUrl.protocol !== 'http:') {
    throw new Error('Race invitations require an HTTP or HTTPS location.');
  }

  const invitation = new URL(currentUrl.origin);
  invitation.pathname = currentUrl.pathname;
  invitation.searchParams.set('join', roomCode);
  return invitation.href;
}
