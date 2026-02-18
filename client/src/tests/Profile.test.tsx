import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useAuth } from '../context/AuthContext';
import Profile from '../pages/Profile';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

const baseUser = {
  id: 'u1', google_id: 'g1', display_name: 'Alice',
  email: 'alice@epic.com', avatar_url: null,
  home_address: null, home_lat: null, home_lng: null,
};

function setup(user = baseUser) {
  const refreshUser = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useAuth).mockReturnValue({ user, loading: false, refreshUser, logout: vi.fn() });
  render(<Profile />);
  return { refreshUser };
}

beforeEach(() => {
  global.fetch = vi.fn();
  // Default: /api/profile returns notify_email=true, /api/config returns no key
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: async () => ({ notify_email: true, mapsApiKey: '' }),
  });
});

describe('Profile — user info', () => {
  it('shows display name and email', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('alice@epic.com')).toBeInTheDocument();
    });
  });

  it('shows "Enter your address" label when no address', async () => {
    setup();
    await waitFor(() => expect(screen.getByText('Enter your address')).toBeInTheDocument());
  });

  it('shows "Change address" label when address is set', async () => {
    setup({ ...baseUser, home_address: '123 Main St', home_lat: 43.07, home_lng: -89.4 });
    await waitFor(() => expect(screen.getByText('Change address')).toBeInTheDocument());
  });

  it('Save Address button is disabled when address is empty', async () => {
    setup();
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: 'Save Address' });
      expect(btn).toBeDisabled();
    });
  });
});

describe('Profile — save error paths', () => {
  it('shows "Network error" when save fetch throws', async () => {
    setup();
    await waitFor(() => screen.getByPlaceholderText('Start typing your address...'));
    fireEvent.change(screen.getByPlaceholderText('Start typing your address...'), { target: { value: '123 Main St' } });
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fail'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Address' }));
    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());
  });

  it('shows "Network error." when notify toggle fetch throws', async () => {
    setup();
    await waitFor(() => screen.getByRole('checkbox'));
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fail'));
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.getByText('Network error.')).toBeInTheDocument());
  });
});

describe('Profile — address save', () => {
  it('enables Save button after typing', async () => {
    setup();
    await waitFor(() => screen.getByPlaceholderText('Start typing your address...'));
    const input = screen.getByPlaceholderText('Start typing your address...');
    fireEvent.change(input, { target: { value: '123 Main St' } });
    expect(screen.getByRole('button', { name: 'Save Address' })).not.toBeDisabled();
  });

  it('shows "Address saved!" on successful save', async () => {
    const { refreshUser } = setup();
    await waitFor(() => screen.getByPlaceholderText('Start typing your address...'));
    fireEvent.change(screen.getByPlaceholderText('Start typing your address...'), { target: { value: '123 Main St' } });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: async () => ({ ...baseUser }) });
    fireEvent.click(screen.getByRole('button', { name: 'Save Address' }));
    await waitFor(() => expect(screen.getByText('Address saved!')).toBeInTheDocument());
    expect(refreshUser).toHaveBeenCalled();
  });

  it('shows error message on save failure', async () => {
    setup();
    await waitFor(() => screen.getByPlaceholderText('Start typing your address...'));
    fireEvent.change(screen.getByPlaceholderText('Start typing your address...'), { target: { value: '123 Main St' } });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Geocoding failed' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Save Address' }));
    await waitFor(() => expect(screen.getByText('Geocoding failed')).toBeInTheDocument());
  });
});

describe('Profile — notification preference', () => {
  it('loads notify_email=true and checks the box', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ notify_email: true, mapsApiKey: '' }) });
    setup();
    await waitFor(() => {
      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
    });
  });

  it('loads notify_email=false and unchecks the box', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ notify_email: false, mapsApiKey: '' }) });
    setup();
    await waitFor(() => {
      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.checked).toBe(false);
    });
  });

  it('disabling shows "Email notifications disabled."', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ notify_email: true, mapsApiKey: '' }) }) // /api/profile
      .mockResolvedValueOnce({ ok: true, json: async () => ({ notify_email: true }) })                // /api/config mock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, notify_email: false }) });   // PATCH

    setup();
    await waitFor(() => screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.getByText('Email notifications disabled.')).toBeInTheDocument());
  });

  it('enabling shows "Email notifications enabled."', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ notify_email: false, mapsApiKey: '' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, notify_email: true }) });

    setup();
    await waitFor(() => screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.getByText('Email notifications enabled.')).toBeInTheDocument());
  });

  it('shows "Failed to update preference." on PATCH failure', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ notify_email: true, mapsApiKey: '' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    setup();
    await waitFor(() => screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.getByText('Failed to update preference.')).toBeInTheDocument());
  });
});
