import { useState, useEffect, useCallback } from 'react';
import MatchCard from '../components/MatchCard';

interface Match {
  id: string;
  partner_name: string;
  partner_avatar: string | null;
  partner_address: string | null;
  direction: string;
  detour_minutes: number;
  time_overlap_minutes: number;
  rank_score: number;
}

export default function Matches() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState('');

  const loadMatches = useCallback(async () => {
    try {
      const res = await fetch('/api/matches');
      if (res.ok) {
        setMatches(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  const computeMatches = async () => {
    setComputing(true);
    setError('');
    try {
      const res = await fetch('/api/matches/compute', { method: 'POST' });
      if (res.ok) {
        await loadMatches();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to compute matches');
      }
    } catch {
      setError('Network error');
    } finally {
      setComputing(false);
    }
  };

  if (loading) return <div className="loading">Loading matches...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Your Matches</h1>
        <button onClick={computeMatches} disabled={computing} className="btn btn-primary">
          {computing ? 'Finding matches...' : 'Find Matches'}
        </button>
      </div>

      {error && <p className="error-message">{error}</p>}

      {matches.length === 0 ? (
        <div className="empty-state">
          <h2>No matches yet</h2>
          <p>
            Make sure you've set your home address and commute schedule, then click
            "Find Matches" to discover carpool partners.
          </p>
        </div>
      ) : (
        <div className="matches-grid">
          {matches.map(m => (
            <MatchCard
              key={m.id}
              partnerName={m.partner_name}
              partnerAvatar={m.partner_avatar}
              partnerAddress={m.partner_address}
              direction={m.direction}
              detourMinutes={m.detour_minutes}
              overlapMinutes={m.time_overlap_minutes}
              rankScore={m.rank_score}
            />
          ))}
        </div>
      )}
    </div>
  );
}
