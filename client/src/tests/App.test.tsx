import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import App from '../App';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

const fakeUser = {
  id: 'u1', google_id: 'g1', display_name: 'Test User',
  email: 't@epic.com', avatar_url: null,
  home_address: null, home_lat: null, home_lng: null,
};

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
});

describe('App routing', () => {
  it('shows global loading spinner when auth is loading', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: true, refreshUser: vi.fn(), logout: vi.fn() });
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('redirects to /login when unauthenticated and at /', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false, refreshUser: vi.fn(), logout: vi.fn() });
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Carpool Planner')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Sign in with Google/i })).toBeInTheDocument();
  });

  it('redirects /login to / when authenticated', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: fakeUser, loading: false, refreshUser: vi.fn(), logout: vi.fn() });
    render(<MemoryRouter initialEntries={['/login']}><App /></MemoryRouter>);
    // Should render Dashboard (redirected to /)
    await waitFor(() => expect(screen.getByText(/Welcome, Test/)).toBeInTheDocument());
  });

  it('shows Navbar when user is authenticated', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: fakeUser, loading: false, refreshUser: vi.fn(), logout: vi.fn() });
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Carpool Planner')).toBeInTheDocument());
    // Navbar renders a brand link + nav links; Dashboard also has 'Carpool Planner' in nav
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('does not show Navbar when unauthenticated', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false, refreshUser: vi.fn(), logout: vi.fn() });
    render(<MemoryRouter initialEntries={['/login']}><App /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('protected route shows loading when ProtectedRoute is loading', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: true, refreshUser: vi.fn(), logout: vi.fn() });
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
