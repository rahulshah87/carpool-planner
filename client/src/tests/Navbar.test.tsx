import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

const baseUser = {
  id: 'u1', google_id: 'g1', display_name: 'Bob Jones',
  email: 'bob@epic.com', avatar_url: null,
  home_address: null, home_lat: null, home_lng: null,
};

function setup(user = baseUser) {
  const logout = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useAuth).mockReturnValue({ user, loading: false, refreshUser: vi.fn(), logout });
  render(<MemoryRouter><Navbar /></MemoryRouter>);
  return { logout };
}

describe('Navbar', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders brand link', () => {
    setup();
    expect(screen.getByText('Carpool Planner')).toBeInTheDocument();
  });

  it('renders all nav links', () => {
    setup();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Matches' })).toBeInTheDocument();
  });

  it('displays user display name', () => {
    setup();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('does not show avatar when avatar_url is null', () => {
    setup();
    // img with alt="" has role "presentation"; check by alt text
    expect(screen.queryByAltText('')).not.toBeInTheDocument();
  });

  it('shows avatar when avatar_url is set', () => {
    setup({ ...baseUser, avatar_url: 'https://example.com/photo.jpg' });
    // img has alt="" so it's role "presentation"; query by alt text
    const img = screen.getByAltText('');
    expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg');
  });

  it('calls logout when Sign out is clicked', () => {
    const { logout } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(logout).toHaveBeenCalledOnce();
  });
});
