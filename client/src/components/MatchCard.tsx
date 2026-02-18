import { useState } from 'react';

interface MatchCardProps {
  matchId: string;
  partnerId: string;
  partnerName: string;
  partnerAvatar: string | null;
  partnerAddress: string | null;
  direction: string;
  detourMinutes: number;
  overlapMinutes: number;
  rankScore: number;
  iExpressedInterest: boolean;
  theyExpressedInterest: boolean;
}

export default function MatchCard({
  matchId: _matchId,
  partnerId,
  partnerName,
  partnerAvatar,
  partnerAddress,
  direction,
  detourMinutes,
  overlapMinutes,
  iExpressedInterest: initialI,
  theyExpressedInterest,
}: MatchCardProps) {
  const [interested, setInterested] = useState(initialI);
  const [loading, setLoading] = useState(false);

  const isMutual = interested && theyExpressedInterest;

  const handleInterest = async () => {
    setLoading(true);
    try {
      if (interested) {
        await fetch('/api/interests', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to_user_id: partnerId, direction }),
        });
        setInterested(false);
      } else {
        await fetch('/api/interests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to_user_id: partnerId, direction }),
        });
        setInterested(true);
      }
    } catch {
      // ignore network errors — button state stays unchanged
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`match-card${isMutual ? ' match-card--mutual' : ''}`}>
      <div className="match-header">
        {partnerAvatar && <img src={partnerAvatar} alt="" className="avatar" />}
        <div>
          <h3>{partnerName}</h3>
          <span className="match-area">{partnerAddress || 'Location not shared'}</span>
        </div>
        {isMutual && <span className="mutual-badge">Mutual match!</span>}
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
      <div className="match-actions">
        {theyExpressedInterest && !interested && (
          <p className="interest-hint">They're interested — let them know if you are too!</p>
        )}
        <button
          className={`btn ${interested ? 'btn-secondary' : 'btn-primary'}`}
          onClick={handleInterest}
          disabled={loading}
        >
          {loading ? '...' : interested ? 'Undo interest' : 'Interested'}
        </button>
      </div>
    </div>
  );
}
