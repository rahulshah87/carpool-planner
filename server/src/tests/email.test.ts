import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSend = vi.fn().mockResolvedValue(undefined);
vi.mock('@sendgrid/mail', () => ({
  default: {
    setApiKey: vi.fn(),
    send: mockSend,
  },
}));

describe('sendInterestEmail', () => {
  const params = {
    toEmail: 'bob@epic.com',
    toName: 'Bob',
    fromName: 'Alice',
    direction: 'TO_WORK',
    appUrl: 'http://localhost:3000',
    isMutual: false,
  };

  beforeEach(() => {
    mockSend.mockReset();
  });

  afterEach(() => {
    delete process.env.SENDGRID_API_KEY;
    delete process.env.FROM_EMAIL;
    vi.resetModules();
  });

  it('sends nothing when SENDGRID_API_KEY is not set', async () => {
    delete process.env.SENDGRID_API_KEY;
    delete process.env.FROM_EMAIL;
    // Re-import after env reset so the module sees the missing key
    const { sendInterestEmail } = await import('../email');
    await sendInterestEmail(params);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends nothing when FROM_EMAIL is not set (even with API key)', async () => {
    process.env.SENDGRID_API_KEY = 'SG.test';
    delete process.env.FROM_EMAIL;
    const { sendInterestEmail } = await import('../email');
    await sendInterestEmail(params);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends one-way interest email when both keys are set', async () => {
    process.env.SENDGRID_API_KEY = 'SG.test';
    process.env.FROM_EMAIL = 'noreply@epic.com';
    const { sendInterestEmail } = await import('../email');
    await sendInterestEmail(params);
    expect(mockSend).toHaveBeenCalledOnce();
    const call = mockSend.mock.calls[0][0];
    expect(call.to).toBe('bob@epic.com');
    expect(call.subject).toContain('Alice');
    expect(call.text).toContain('to work');
    expect(call.text).toContain('/matches');
  });

  it('sends mutual-match email when isMutual is true', async () => {
    process.env.SENDGRID_API_KEY = 'SG.test';
    process.env.FROM_EMAIL = 'noreply@epic.com';
    const { sendInterestEmail } = await import('../email');
    await sendInterestEmail({ ...params, isMutual: true });
    expect(mockSend).toHaveBeenCalledOnce();
    const call = mockSend.mock.calls[0][0];
    expect(call.subject).toMatch(/mutual/i);
    expect(call.text).toContain('both expressed interest');
  });

  it('uses FROM_WORK direction label', async () => {
    process.env.SENDGRID_API_KEY = 'SG.test';
    process.env.FROM_EMAIL = 'noreply@epic.com';
    const { sendInterestEmail } = await import('../email');
    await sendInterestEmail({ ...params, direction: 'FROM_WORK' });
    const call = mockSend.mock.calls[0][0];
    expect(call.text).toContain('from work');
  });
});
