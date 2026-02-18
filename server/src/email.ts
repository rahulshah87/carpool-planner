import sgMail from '@sendgrid/mail';

const apiKey = process.env.SENDGRID_API_KEY;
const fromEmail = process.env.FROM_EMAIL;

if (apiKey) {
  sgMail.setApiKey(apiKey);
}

export interface InterestEmailParams {
  toEmail: string;
  toName: string;
  fromName: string;
  direction: string;
  appUrl: string;
  isMutual: boolean;
}

export async function sendInterestEmail(params: InterestEmailParams): Promise<void> {
  if (!apiKey || !fromEmail) return; // email not configured — skip silently

  const dirLabel = params.direction === 'TO_WORK' ? 'to work' : 'from work';
  const subject = params.isMutual
    ? `Mutual carpool match with ${params.fromName}!`
    : `${params.fromName} is interested in carpooling with you`;

  const body = params.isMutual
    ? `Great news! You and ${params.fromName} have both expressed interest in carpooling ${dirLabel}. ` +
      `Reply to each other's emails to coordinate — your email addresses are now mutually visible.\n\n` +
      `View your matches: ${params.appUrl}/matches`
    : `${params.fromName} is interested in carpooling with you ${dirLabel}.\n\n` +
      `If you're also interested, click "Interested" on their card and you'll both get each other's contact info.\n\n` +
      `View your matches: ${params.appUrl}/matches`;

  await sgMail.send({
    to: params.toEmail,
    from: fromEmail,
    subject,
    text: body,
  });
}
