import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Matches from '../pages/Matches';

const fakeMatch = {
  id: 'match-1',
  partner_id: 'user-2',
  partner_name: 'Jane Doe',
  partner_avatar: null,
  partner_address: 'Willy Street',
  direction: 'TO_WORK',
  detour_minutes: 5,
  time_overlap_minutes: 45,
  rank_score: 2.5,
  i_expressed_interest: false,
  they_expressed_interest: false,
};

describe('Matches page', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('shows empty state when no matches', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    render(<Matches />);
    await waitFor(() => expect(screen.getByText('No matches yet')).toBeInTheDocument());
  });

  it('renders match cards', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [fakeMatch],
    });
    render(<Matches />);
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
  });

  it('shows error when compute fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // initial load
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'No address set' }) }); // compute

    render(<Matches />);
    await waitFor(() => screen.getByText('Find Matches'));

    fireEvent.click(screen.getByText('Find Matches'));
    await waitFor(() => expect(screen.getByText('No address set')).toBeInTheDocument());
  });

  it('reloads matches after successful compute', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => [] })           // initial load
      .mockResolvedValueOnce({ ok: true, json: async () => ({ computed: 1 }) }) // compute
      .mockResolvedValueOnce({ ok: true, json: async () => [fakeMatch] }); // reload

    render(<Matches />);
    await waitFor(() => screen.getByText('Find Matches'));

    fireEvent.click(screen.getByText('Find Matches'));
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
  });
});
