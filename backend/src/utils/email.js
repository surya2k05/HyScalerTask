const nodemailer = require('nodemailer');

/**
 * Sends a project invitation email to the recipient.
 * If SMTP credentials are not configured, it logs the invite details to the console.
 */
async function sendInvitationEmail({ toEmail, projectName, inviterName, inviteLink, isRegistered = false }) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  const headerText = isRegistered ? 'Added to Project' : 'Collaborative Invitation';
  const bodyText = isRegistered
    ? `You have been added by <strong>${inviterName}</strong> to collaborate on the project <strong>${projectName}</strong> in TaskFlow.`
    : `<strong>${inviterName}</strong> has invited you to collaborate on the project <strong>${projectName}</strong> in TaskFlow.`;
  const instructionText = isRegistered
    ? 'To view your dashboard and access the shared Kanban board, please click the button below to sign in:'
    : 'To join the team and access the shared Kanban board, please click the button below to complete your registration:';
  const buttonText = isRegistered ? 'Login to Dashboard' : 'Accept Invitation & Register';

  // HTML content for a clean, premium email notification card
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #6366f1; text-align: center;">TaskFlow ${headerText}</h2>
      <p>Hello,</p>
      <p>${bodyText}</p>
      <p>${instructionText}</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${inviteLink}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">${buttonText}</a>
      </div>
      <p style="color: #555; font-size: 0.9em; line-height: 1.5;">If the button doesn't work, you can copy and paste this URL directly into your browser:</p>
      <p style="word-break: break-all; font-size: 0.85em; color: #6366f1;"><a href="${inviteLink}">${inviteLink}</a></p>
      <hr style="border: 0; border-top: 1px solid #eaeaea; margin: 20px 0;" />
      <p style="font-size: 0.8em; color: #888; text-align: center;">This is an automated message from TaskFlow. Please do not reply.</p>
    </div>
  `;

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: parseInt(SMTP_PORT || '587', 10),
        secure: parseInt(SMTP_PORT || '587', 10) === 465,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS
        }
      });

      const info = await transporter.sendMail({
        from: SMTP_FROM || 'TaskFlow <no-reply@taskflow.com>',
        to: toEmail,
        subject: isRegistered 
          ? `TaskFlow: Added to collaborate on ${projectName}`
          : `TaskFlow: Invitation to collaborate on ${projectName}`,
        text: `${inviterName} has invited you to collaborate on ${projectName}. Link: ${inviteLink}`,
        html: htmlContent
      });

      console.log(`[Email] Invitation sent to ${toEmail}. MessageId: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('[Email Error] Failed to send SMTP email:', error);
      return { success: false, error: error.message };
    }
  } else {
    // If SMTP is not configured, simulate email sending by logging it
    console.log('\n==================================================');
    console.log('[Email Simulation] SMTP is not configured in .env');
    console.log(`To: ${toEmail}`);
    console.log(`Subject: TaskFlow: ${isRegistered ? 'Added' : 'Invited'} to collaborate on ${projectName}`);
    console.log(`Invite Link: ${inviteLink}`);
    console.log('==================================================\n');
    return { success: true, simulated: true };
  }
}

module.exports = {
  sendInvitationEmail
};
