import { useEffect, useRef } from 'react';

import type { DiscoveryMatch } from '../../shared/api.js';
import { HostedGamesList } from './HostedGamesList.js';

type OptionsModalProps = {
  isOpen: boolean;
  isLoadingPuzzle: boolean;
  multiplayerLocked: boolean;
  resetDisabled: boolean;
  status: string;
  joinCode: string;
  roomCodeText: string;
  matchStatus: string;
  lanDiscoveryEnabled: boolean;
  discoveredMatches: DiscoveryMatch[];
  isGuest: boolean;
  isHost: boolean;
  finishedMatch: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onNewPuzzle: () => void;
  onReset: () => void;
  onHostRace: () => void;
  onJoinRace: () => void;
  onJoinCodeChange: (value: string) => void;
  onStartNextRace: () => void;
  onLeaveRace: () => void;
  onCloseRace: () => void;
  onJoinDiscoveredMatch: (match: DiscoveryMatch) => void;
};

export function OptionsModal({
  isOpen,
  isLoadingPuzzle,
  multiplayerLocked,
  resetDisabled,
  status,
  joinCode,
  roomCodeText,
  matchStatus,
  lanDiscoveryEnabled,
  discoveredMatches,
  isGuest,
  isHost,
  finishedMatch,
  onOpenChange,
  onNewPuzzle,
  onReset,
  onHostRace,
  onJoinRace,
  onJoinCodeChange,
  onStartNextRace,
  onLeaveRace,
  onCloseRace,
  onJoinDiscoveredMatch,
}: OptionsModalProps) {
  const modalRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    if (!modalRef.current) {
      return;
    }

    if (isOpen && !modalRef.current.open) {
      modalRef.current.showModal();
    } else if (!isOpen && modalRef.current.open) {
      modalRef.current.close();
    }
  }, [isOpen]);

  return (
    <dialog
      id="options-modal"
      className="options-modal"
      aria-label="Game options"
      ref={modalRef}
      onClose={() => onOpenChange(false)}
      onClick={(event) => {
        const modalRect = event.currentTarget.getBoundingClientRect();
        const clickedOutside =
          event.clientX < modalRect.left ||
          event.clientX > modalRect.right ||
          event.clientY < modalRect.top ||
          event.clientY > modalRect.bottom;

        if (clickedOutside) {
          onOpenChange(false);
        }
      }}
    >
      <div className="options-modal-content">
        <div className="options-modal-header">
          <h1>Tectonic</h1>
          <button id="close-menu" className="menu-close" type="button" aria-label="Close game options" onClick={() => onOpenChange(false)}>
            ✕
          </button>
        </div>
        <p className="intro">Fill each region with the numbers 1 through its size. Matching numbers may not touch, even diagonally.</p>
        <div className="controls">
          <button id="new-game" type="button" disabled={isLoadingPuzzle || multiplayerLocked} onClick={onNewPuzzle}>
            New puzzle
          </button>
          <button id="reset-game" type="button" disabled={resetDisabled} onClick={onReset}>
            Reset
          </button>
        </div>
        <p id="status" className="status">{status}</p>
        <section className="multiplayer-panel" aria-label="Create room controls">
          <h2>Create room</h2>
          <div className="controls multiplayer-controls">
            <button id="host-race" type="button" disabled={isLoadingPuzzle || multiplayerLocked} onClick={onHostRace}>
              Host race
            </button>
            <div className="join-controls">
              <input
                id="join-code"
                type="text"
                inputMode="text"
                maxLength={4}
                placeholder="Code"
                aria-label="Race code"
                value={joinCode}
                disabled={isLoadingPuzzle || multiplayerLocked}
                onChange={(event) => onJoinCodeChange(event.target.value)}
              />
              <button
                id="join-race"
                type="button"
                disabled={isLoadingPuzzle || multiplayerLocked || joinCode.trim().length !== 4}
                onClick={onJoinRace}
              >
                Join race
              </button>
            </div>
          </div>
          <div className="controls multiplayer-session-controls">
            <button id="next-race" type="button" hidden={!(isHost && finishedMatch)} disabled={isLoadingPuzzle || !(isHost && finishedMatch)} onClick={onStartNextRace}>
              Start next race
            </button>
            <button id="leave-race" type="button" hidden={!isGuest} disabled={isLoadingPuzzle || !isGuest} onClick={onLeaveRace}>
              Leave race
            </button>
            <button id="close-race" type="button" hidden={!isHost} disabled={isLoadingPuzzle || !isHost} onClick={onCloseRace}>
              Close race
            </button>
          </div>
          <p id="room-code" className="status match-status">{roomCodeText}</p>
          <p id="match-status" className="status match-status">{matchStatus}</p>
          <HostedGamesList
            hidden={!lanDiscoveryEnabled}
            matches={discoveredMatches}
            disabled={isLoadingPuzzle || multiplayerLocked}
            onJoin={onJoinDiscoveredMatch}
          />
        </section>
      </div>
    </dialog>
  );
}
