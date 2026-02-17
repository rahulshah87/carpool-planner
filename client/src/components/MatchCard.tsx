interface MatchCardProps {
  partnerName: string;
  partnerAvatar: string | null;
  partnerAddress: string | null;
  direction: string;
  detourMinutes: number;
  overlapMinutes: number;
  rankScore: number;
}

export default function MatchCard({
  partnerName,
  partnerAvatar,
  partnerAddress,
  direction,
  detourMinutes,
  overlapMinutes,
}: MatchCardProps) {
  return (
    <div className="match-card">
      <div className="match-header">
        {partnerAvatar && <img src={partnerAvatar} alt="" className="avatar" />}
        <div>
          <h3>{partnerName}</h3>
          <span className="match-area">{partnerAddress || 'Location not shared'}</span>
        </div>
      </div>
      <div className="match-details">
        <div className="match-stat">
          <span className="stat-label">Direction</span>
          <span className="stat-value">{direction === 'TO_WORK' ? 'To work' : 'From work'}</span>
        </div>
        <div className="match-stat">
          <span className="stat-label">Detour</span>
          <span className="stat-value">~{Math.round(detourMinutes)} min</span>
        </div>
        <div className="match-stat">
          <span className="stat-label">Schedule overlap</span>
          <span className="stat-value">{overlapMinutes} min window</span>
        </div>
      </div>
    </div>
  );
}
