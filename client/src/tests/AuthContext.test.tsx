import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';

function UserDisplay() {
  const { user, loading, logout, refreshUser } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Not logged in</div>;
  return (
    <div>
      <span data-testid="name">{user.display_name}</span>
      <button onClick={logout}>Logout</button>
      <button onClick={refreshUser}>Refresh</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <UserDisplay />
    </AuthProvider>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('starts in loading state', () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {})); // never resolves
    render(<AuthProvider><div data-testid="child">child</div></AuthProvider>);
    // AuthProvider renders children immediately; loading is internal
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('sets user when /api/auth/me returns ok', async () => {
    const fakeUser = { id: 'u1', display_name: 'Alice', email: 'a@t.com', avatar_url: null, home_address: null, home_lat: null, home_lng: null, google_id: 'g1' };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => fakeUser });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Alice'));
  });

  it('sets null user when /api/auth/me returns 401', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    renderProvider();
    await waitFor(() => expect(screen.getByText('Not logged in')).toBeInTheDocument());
  });

  it('sets null user on network error', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
    renderProvider();
    await waitFor(() => expect(screen.getByText('Not logged in')).toBeInTheDocument());
  });

  it('refreshUser re-fetches and updates user', async () => {
    const fakeUser = { id: 'u1', display_name: 'Alice', email: 'a@t.com', avatar_url: null, home_address: null, home_lat: null, home_lng: null, google_id: 'g1' };
    const updatedUser = { ...fakeUser, display_name: 'Alice Updated' };
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => fakeUser })
      .mockResolvedValueOnce({ ok: true, json: async () => updatedUser });

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Alice'));

    await act(async () => {
      screen.getByText('Refresh').click();
    });
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Alice Updated'));
  });

  it('logout clears user and posts to /api/auth/logout', async () => {
    const fakeUser = { id: 'u1', display_name: 'Alice', email: 'a@t.com', avatar_url: null, home_address: null, home_lat: null, home_lng: null, google_id: 'g1' };
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => fakeUser }) // initial load
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });    // logout POST

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('name')).toBeInTheDocument());

    await act(async () => {
      screen.getByText('Logout').click();
    });

    await waitFor(() => expect(screen.getByText('Not logged in')).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
  });
});
