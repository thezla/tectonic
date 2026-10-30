import { useEffect, useRef, useState } from 'react';

import { createRaceInvitation } from '../invitation.js';
import { copyRaceText, shareRaceInvitation } from '../raceSharing.js';

export function CopyRaceInvitation({ roomCode }: { roomCode: string }) {
  const [message, setMessage] = useState('');
  const [manualCopy, setManualCopy] = useState<{ label: string; value: string } | null>(null);
  const [pending, setPending] = useState<'code' | 'link' | null>(null);
  const requestRef = useRef(0);

  useEffect(() => () => {
    requestRef.current += 1;
  }, []);

  async function copyOrShare(action: 'code' | 'link') {
    const request = ++requestRef.current;
    setMessage('');
    setManualCopy(null);
    setPending(action);
    try {
      const value = action === 'code' ? roomCode : createRaceInvitation(window.location.href, roomCode);
      const outcome = action === 'code'
        ? await copyRaceText(value) ? 'copied' : 'manual'
        : await shareRaceInvitation(value);

      if (request !== requestRef.current) {
        return;
      }

      if (outcome === 'manual') {
        const label = action === 'code' ? 'Room code' : 'Invitation link';
        setMessage(`Automatic ${action === 'code' ? 'copying' : 'sharing'} is unavailable. Select and copy the ${label.toLowerCase()} below.`);
        setManualCopy({ label, value });
      } else if (outcome === 'cancelled') {
        setMessage('Sharing canceled.');
      } else if (outcome === 'shared') {
        setMessage('Invitation shared.');
      } else {
        setMessage(action === 'code' ? 'Room code copied.' : 'Invitation link copied. Share it with your opponent.');
      }
    } catch {
      if (request === requestRef.current) {
        setMessage('Could not prepare the invitation. Select and copy the room code instead.');
        setManualCopy({ label: 'Room code', value: roomCode });
      }
    } finally {
      if (request === requestRef.current) {
        setPending(null);
      }
    }
  }

  return (
    <div className="race-invitation-actions">
      <button type="button" disabled={pending !== null} onClick={() => void copyOrShare('code')}>
        <span aria-hidden="true">⧉ </span>{pending === 'code' ? 'Copying…' : 'Copy code'}
      </button>
      <button type="button" disabled={pending !== null} onClick={() => void copyOrShare('link')}>
        <span aria-hidden="true">↗ </span>{pending === 'link' ? 'Sharing…' : 'Share link'}
      </button>
      <p className="invitation-feedback" role="status" aria-live="polite" aria-atomic="true">{message}</p>
      {manualCopy && (
        <label className="invitation-link">
          {manualCopy.label}
          <input
            type="text"
            readOnly
            value={manualCopy.value}
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => event.currentTarget.select()}
          />
        </label>
      )}
    </div>
  );
}
