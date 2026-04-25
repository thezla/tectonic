import type { DiscoveryMatch } from '../../shared/api.js';

type HostedGamesListProps = {
  hidden: boolean;
  matches: DiscoveryMatch[];
  disabled: boolean;
  onJoin: (match: DiscoveryMatch) => void;
};

export function HostedGamesList({ hidden, matches, disabled, onJoin }: HostedGamesListProps) {
  return (
    <section className="hosted-games" aria-label="Hosted games on your network" hidden={hidden}>
      <h3>Hosted games on your network</h3>
      <div id="hosted-games-list" className="hosted-games-list">
        {matches.length === 0 ? <p className="status hosted-games-empty">No joinable hosted games found yet.</p> : null}
        {matches.map((match) => (
          <article className="hosted-game-card" key={`${match.instanceId}:${match.matchId}`}>
            <div className="hosted-game-meta">
              <p className="hosted-game-title">{match.host || 'Room host'}</p>
              <span className="hosted-game-code">Code {match.roomCode}</span>
            </div>
            <p className="hosted-game-detail">{match.hostAddress}:{match.port}</p>
            <div className="hosted-game-actions">
              <button type="button" disabled={disabled} onClick={() => onJoin(match)}>
                Join
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
