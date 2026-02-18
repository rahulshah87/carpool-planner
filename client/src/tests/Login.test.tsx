import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Login from '../pages/Login';

describe('Login', () => {
  it('renders app title', () => {
    render(<Login />);
    expect(screen.getByText('Carpool Planner')).toBeInTheDocument();
  });

  it('renders sign-in link pointing to /api/auth/google', () => {
    render(<Login />);
    const link = screen.getByRole('link', { name: /Sign in with Google/i });
    expect(link).toHaveAttribute('href', '/api/auth/google');
  });

  it('renders tagline', () => {
    render(<Login />);
    expect(screen.getByText(/Find carpool partners/i)).toBeInTheDocument();
  });
});
