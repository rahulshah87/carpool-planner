import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Dashboard from '../pages/Dashboard';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

const baseUser = {
  id: 'u1', google_id: 'g1', display_name: 'Jane Smith',
  email: 'jane@epic.com', avatar_url: null,
  home_address: null, home_lat: null, home_lng: null,
};

function setup(user = baseUser, prefs: object[] = []) {
  vi.mocked(useAuth).mockReturnValue({ user, loading: false, refreshUser: vi.fn(), logout: vi.fn() });
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => prefs });
  return render(<MemoryRouter><Dashboard /></MemoryRouter>);
}

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('Dashboard', () => {
  it('shows first name from display_name', async () => {
    setup();
    await waitFor(() => expect(screen.getByText('Welcome, Jane')).toBeInTheDocument());
  });

  it('shows "Add address" when home_address is null', async () => {
    setup();
    await waitFor(() => expect(screen.getByText('Add address')).toBeInTheDocument());
  });

  it('shows "Update address" and done state when home_address is set', async () => {
    setup({ ...baseUser, home_address: '123 Main St', home_lat: 43.07, home_lng: -89.4 });
    await waitFor(() => expect(screen.getByText('Update address')).toBeInTheDocument());
  });

  it('shows "Set schedule" when no preferences', async () => {
    setup();
    await waitFor(() => expect(screen.getByText('Set schedule')).toBeInTheDocument());
  });

  it('shows "Update schedule" when preferences are loaded', async () => {
    const prefs = [{ direction: 'TO_WORK', earliest_time: '07:00', latest_time: '08:30', days_of_week: [0, 1, 2], role: 'DRIVER' }];
    setup(baseUser, prefs);
    await waitFor(() => expect(screen.getByText('Update schedule')).toBeInTheDocument());
  });

  it('renders all three checklist steps', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('Set your home address')).toBeInTheDocument();
      expect(screen.getByText('Set your commute schedule')).toBeInTheDocument();
      expect(screen.getByText('Find matches')).toBeInTheDocument();
    });
  });

  it('shows schedule summary card when TO_WORK pref exists', async () => {
    const prefs = [{ direction: 'TO_WORK', earliest_time: '07:00', latest_time: '08:30', days_of_week: [0, 1, 2, 3, 4], role: 'EITHER' }];
    setup(baseUser, prefs);
    await waitFor(() => {
      expect(screen.getByText('Your Schedule')).toBeInTheDocument();
      expect(screen.getByText('To Work')).toBeInTheDocument();
      expect(screen.getByText('7:00 AM - 8:30 AM')).toBeInTheDocument();
      expect(screen.getByText(/Mon, Tue, Wed, Thu, Fri/)).toBeInTheDocument();
      expect(screen.getByText(/Driver or Rider/)).toBeInTheDocument();
    });
  });

  it('shows FROM_WORK schedule summary with correct time and role', async () => {
    const prefs = [{ direction: 'FROM_WORK', earliest_time: '17:00', latest_time: '18:30', days_of_week: [0, 1], role: 'DRIVER' }];
    setup(baseUser, prefs);
    await waitFor(() => {
      expect(screen.getByText('From Work')).toBeInTheDocument();
      expect(screen.getByText('5:00 PM - 6:30 PM')).toBeInTheDocument();
      expect(screen.getByText(/Driver/)).toBeInTheDocument();
    });
  });

  it('shows Rider role label correctly', async () => {
    const prefs = [{ direction: 'TO_WORK', earliest_time: '07:00', latest_time: '08:30', days_of_week: [0], role: 'RIDER' }];
    setup(baseUser, prefs);
    await waitFor(() => expect(screen.getByText(/Rider/)).toBeInTheDocument());
  });

  it('formats noon correctly as 12:00 PM', async () => {
    const prefs = [{ direction: 'TO_WORK', earliest_time: '12:00', latest_time: '13:00', days_of_week: [0], role: 'EITHER' }];
    setup(baseUser, prefs);
    await waitFor(() => expect(screen.getByText('12:00 PM - 1:00 PM')).toBeInTheDocument());
  });

  it('renders "View matches" link', async () => {
    setup();
    await waitFor(() => expect(screen.getByRole('link', { name: 'View matches' })).toBeInTheDocument());
  });

  it('does not show schedule card when no prefs', async () => {
    setup(baseUser, []);
    await waitFor(() => expect(screen.queryByText('Your Schedule')).not.toBeInTheDocument());
  });
});
