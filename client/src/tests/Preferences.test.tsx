import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Preferences from '../pages/Preferences';

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
});

function renderPrefs() {
  return render(<Preferences />);
}

describe('Preferences — rendering', () => {
  it('renders both direction headings', async () => {
    renderPrefs();
    await waitFor(() => {
      expect(screen.getByText('Commute to Work')).toBeInTheDocument();
      expect(screen.getByText('Commute from Work')).toBeInTheDocument();
    });
  });

  it('renders default time inputs for TO_WORK', async () => {
    renderPrefs();
    await waitFor(() => {
      const timeInputs = screen.getAllByDisplayValue('07:00');
      expect(timeInputs.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders all day buttons', async () => {
    renderPrefs();
    await waitFor(() => {
      expect(screen.getAllByText('Mon').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Fri').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders Driver, Rider, Either role buttons', async () => {
    renderPrefs();
    await waitFor(() => {
      expect(screen.getAllByText('Driver').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Rider').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Either').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('pre-fills form when prefs are returned from API', async () => {
    const savedPref = { direction: 'TO_WORK', earliest_time: '08:00', latest_time: '09:00', days_of_week: [1, 2], role: 'DRIVER' };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => [savedPref] });
    renderPrefs();
    await waitFor(() => {
      const inputs = screen.getAllByDisplayValue('08:00');
      expect(inputs.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('Preferences — validation', () => {
  it('shows error when latest <= earliest', async () => {
    renderPrefs();
    await waitFor(() => screen.getByText('Commute to Work'));

    // Find TO_WORK form's time inputs (first two time inputs)
    const [earliestInput] = screen.getAllByDisplayValue('07:00');
    const [latestInput] = screen.getAllByDisplayValue('08:30');
    fireEvent.change(earliestInput, { target: { value: '09:00' } });
    fireEvent.change(latestInput, { target: { value: '08:00' } });

    const [saveBtn] = screen.getAllByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);
    await waitFor(() => expect(screen.getByText('Latest departure must be after earliest departure.')).toBeInTheDocument());
  });

  it('shows error when no days are selected', async () => {
    renderPrefs();
    await waitFor(() => screen.getByText('Commute to Work'));

    // Deselect all days in the first form by clicking all 5 day buttons
    const monBtns = screen.getAllByText('Mon');
    const tueBtns = screen.getAllByText('Tue');
    const wedBtns = screen.getAllByText('Wed');
    const thuBtns = screen.getAllByText('Thu');
    const friBtns = screen.getAllByText('Fri');
    [monBtns[0], tueBtns[0], wedBtns[0], thuBtns[0], friBtns[0]].forEach(btn => fireEvent.click(btn));

    const [saveBtn] = screen.getAllByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);
    await waitFor(() => expect(screen.getByText('Select at least one day.')).toBeInTheDocument());
  });
});

describe('Preferences — save', () => {
  it('shows "Saved!" on successful save', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => [] })  // initial GET
      .mockResolvedValueOnce({ ok: true, json: async () => [] })  // PUT
      .mockResolvedValueOnce({ ok: true, json: async () => [] }); // reload GET

    renderPrefs();
    await waitFor(() => screen.getByText('Commute to Work'));

    const [saveBtn] = screen.getAllByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);
    await waitFor(() => expect(screen.getByText('Saved!')).toBeInTheDocument());
  });

  it('shows error from API on save failure', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Server error' }) });

    renderPrefs();
    await waitFor(() => screen.getByText('Commute to Work'));

    const [saveBtn] = screen.getAllByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);
    await waitFor(() => expect(screen.getByText('Server error')).toBeInTheDocument());
  });
});

describe('Preferences — day toggle', () => {
  it('clicking an active day deselects it', async () => {
    renderPrefs();
    await waitFor(() => screen.getByText('Commute to Work'));
    // Mon starts as active; clicking it should deselect
    const [monBtn] = screen.getAllByText('Mon');
    expect(monBtn).toHaveClass('active');
    fireEvent.click(monBtn);
    expect(monBtn).not.toHaveClass('active');
  });

  it('clicking an inactive day selects it', async () => {
    // Start with Mon-Fri active; deselect Mon then reselect
    renderPrefs();
    await waitFor(() => screen.getByText('Commute to Work'));
    const [monBtn] = screen.getAllByText('Mon');
    fireEvent.click(monBtn); // deselect
    expect(monBtn).not.toHaveClass('active');
    fireEvent.click(monBtn); // reselect
    expect(monBtn).toHaveClass('active');
  });
});

describe('Preferences — role selection', () => {
  it('clicking Driver sets it as active', async () => {
    renderPrefs();
    await waitFor(() => screen.getByText('Commute to Work'));
    const [driverBtn] = screen.getAllByText('Driver');
    fireEvent.click(driverBtn);
    expect(driverBtn).toHaveClass('active');
  });

  it('clicking Rider sets it as active and unsets Driver', async () => {
    renderPrefs();
    await waitFor(() => screen.getByText('Commute to Work'));
    const [driverBtn] = screen.getAllByText('Driver');
    const [riderBtn] = screen.getAllByText('Rider');
    fireEvent.click(driverBtn);
    fireEvent.click(riderBtn);
    expect(riderBtn).toHaveClass('active');
    expect(driverBtn).not.toHaveClass('active');
  });
});
