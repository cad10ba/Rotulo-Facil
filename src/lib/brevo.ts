/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

interface SendBrevoEmailParams {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent: string;
}

export function isBrevoConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_API_KEY.trim() !== '' && process.env.BREVO_API_KEY !== 'MY_BREVO_API_KEY');
}

export async function sendBrevoEmail({
  toEmail,
  toName,
  subject,
  htmlContent,
  textContent,
}: SendBrevoEmailParams): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!isBrevoConfigured() || !apiKey) {
    throw new Error('BREVO_NOT_CONFIGURED');
  }

  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'no-reply@rotulofacil.app';

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        name: 'RótuloFácil',
        email: senderEmail,
      },
      to: [
        {
          email: toEmail,
          name: toName || toEmail,
        },
      ],
      subject,
      htmlContent,
      textContent,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    console.error('Brevo API error:', response.status, errorBody);
    throw new Error(`Brevo API error (${response.status})`);
  }
}

export async function sendConfirmationEmailViaBrevo(
  toEmail: string,
  toName: string | undefined,
  confirmationLink: string
): Promise<void> {
  const safeName = toName || 'usuário(a)';
  const htmlContent = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
      <h2 style="color: #059669; margin: 0 0 12px;">Confirme seu cadastro no RótuloFácil</h2>
      <p style="font-size: 14px; line-height: 1.6;">Olá, <strong>${safeName}</strong>!</p>
      <p style="font-size: 14px; line-height: 1.6;">
        Para liberar o acesso à sua conta e sincronizar suas receitas com segurança, confirme seu e-mail clicando no botão abaixo:
      </p>
      <div style="margin: 24px 0; text-align: center;">
        <a href="${confirmationLink}" style="display: inline-block; background-color: #059669; color: #ffffff; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px;">
          Confirmar meu e-mail
        </a>
      </div>
      <p style="font-size: 12px; color: #64748b; line-height: 1.5;">
        Se o botão não funcionar, copie e cole este link no navegador:<br />
        <a href="${confirmationLink}" style="color: #059669; word-break: break-all;">${confirmationLink}</a>
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="font-size: 11px; color: #94a3b8; margin: 0;">RótuloFácil • Rotulagem Nutricional ANVISA</p>
    </div>
  `;

  const textContent = `Olá, ${safeName}! Confirme seu e-mail no RótuloFácil acessando o link: ${confirmationLink}`;

  await sendBrevoEmail({
    toEmail,
    toName,
    subject: 'Confirme seu e-mail — RótuloFácil',
    htmlContent,
    textContent,
  });
}

export async function sendPasswordResetEmailViaBrevo(
  toEmail: string,
  resetLink: string
): Promise<void> {
  const htmlContent = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
      <h2 style="color: #059669; margin: 0 0 12px;">Redefinição de senha — RótuloFácil</h2>
      <p style="font-size: 14px; line-height: 1.6;">
        Recebemos uma solicitação para criar ou redefinir a senha da sua conta no <strong>RótuloFácil</strong>.
      </p>
      <p style="font-size: 14px; line-height: 1.6;">
        Clique no botão abaixo para cadastrar uma nova senha e acessar suas receitas:
      </p>
      <div style="margin: 24px 0; text-align: center;">
        <a href="${resetLink}" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px;">
          Redefinir minha senha
        </a>
      </div>
      <p style="font-size: 12px; color: #64748b; line-height: 1.5;">
        Se você não solicitou esta alteração, ignore este e-mail. Link direto:<br />
        <a href="${resetLink}" style="color: #059669; word-break: break-all;">${resetLink}</a>
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="font-size: 11px; color: #94a3b8; margin: 0;">RótuloFácil • Rotulagem Nutricional ANVISA</p>
    </div>
  `;

  const textContent = `Redefina sua senha do RótuloFácil acessando o link: ${resetLink}`;

  await sendBrevoEmail({
    toEmail,
    subject: 'Esqueci minha senha — RótuloFácil',
    htmlContent,
    textContent,
  });
}
