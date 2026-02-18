import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MatchCard from '../components/MatchCard';

const baseProps = {
  matchId: 'match-1',
  partnerId: 'user-2',
  partnerName: 'Jane Doe',
  partnerAvatar: null,
  partnerAddress: 'Willy Street',
  direction: 'TO_WORK',
  detourMinutes: 5,
  overlapMinutes: 45,
  rankScore: 2.5,
  iExpressedInterest: false,
  theyExpressedInterest: false,
};

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe('MatchCard', () => {
  it('renders partner name and neighborhood', () => {
    render(<MatchCard {...baseProps} />);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Willy Street')).toBeInTheDocument();
  });

  it('shows direction label', () => {
    render(<MatchCard {...baseProps} />);
    expect(screen.getByText('To work')).toBeInTheDocument();
  });

  it('shows From work for FROM_WORK direction', () => {
    render(<MatchCard {...baseProps} direction="FROM_WORK" />);
    expect(screen.getByText('From work')).toBeInTheDocument();
  });

  it('shows detour and overlap stats', () => {
    render(<MatchCard {...baseProps} />);
    expect(screen.getByText('~5 min')).toBeInTheDocument();
    expect(screen.getByText('45 min window')).toBeInTheDocument();
  });

  it('shows "Location not shared" when no address', () => {
    render(<MatchCard {...baseProps} partnerAddress={null} />);
    expect(screen.getByText('Location not shared')).toBeInTheDocument();
  });

  it('shows Interested button when not yet interested', () => {
    render(<MatchCard {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Interested' })).toBeInTheDocument();
  });

  it('shows Undo interest button when already interested', () => {
    render(<MatchCard {...baseProps} iExpressedInterest={true} />);
    expect(screen.getByRole('button', { name: 'Undo interest' })).toBeInTheDocument();
  });

  it('shows mutual badge when both expressed interest', () => {
    render(<MatchCard {...baseProps} iExpressedInterest={true} theyExpressedInterest={true} />);
    expect(screen.getByText('Mutual match!')).toBeInTheDocument();
  });

  it('shows hint when they are interested but I am not', () => {
    render(<MatchCard {...baseProps} theyExpressedInterest={true} />);
    expect(screen.getByText(/They're interested/)).toBeInTheDocument();
  });

  it('posts interest and flips to Undo interest', async () => {
    render(<MatchCard {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Interested' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Undo interest' })).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/interests',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('sends DELETE when undoing interest', async () => {
    render(<MatchCard {...baseProps} iExpressedInterest={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo interest' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Interested' })).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/interests',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
