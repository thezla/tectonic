import { useEffect, useRef, useState } from 'react';

import { createRaceInvitation } from '../invitation.js';

export function CopyRaceInvitation({ roomCode }: { roomCode: string }) {
  const [message, setMessage] = useState('');
  const [manualLink, setManualLink] = useState('');
  const [isCopying, setIsCopying] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => () => {
    requestRef.current += 1;
  }, []);

  async function copyInvitation() {
    const request = ++requestRef.current;
    const invitation = createRaceInvitation(window.location.href, roomCode);
    setMessage('');
    setManualLink('');

    if (!window.isSecureContext || typeof navigator.clipboard?.writeText !== 'function') {
      setMessage('Automatic copying is unavailable. Select and copy the invitation link below.');
      setManualLink(invitation);
      return;
    }

    setIsCopying(true);
    try {
      await navigator.clipboard.writeText(invitation);
      if (request === requestRef.current) {
        setMessage('Invitation copied.');
      }
    } catch {
      if (request === requestRef.current) {
        setMessage('Could not copy the invitation. Select and copy the link below.');
        setManualLink(invitation);
      }
    } finally {
      if (request === requestRef.current) {
        setIsCopying(false);
      }
    }
  }

  return (
    <>
      <button type="button" disabled={isCopying} onClick={() => void copyInvitation()}>
        {isCopying ? 'Copying…' : 'Copy invitation'}
      </button>
      <p className="invitation-feedback" role="status" aria-live="polite" aria-atomic="true">{message}</p>
      {manualLink && (
        <label className="invitation-link">
          Invitation link
          <input
            type="text"
            readOnly
            value={manualLink}
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => event.currentTarget.select()}
          />
        </label>
      )}
    </>
  );
}
