const axios = require('./lib/http').externalHttp;
const config = require('./config');
const logger = require('./lib/logger');

// Проверяем наличие API ключа. A missing key used to kill the whole process
// on require() — that's too heavy a hammer for one feature (email), so this
// module now just remembers whether it's configured and the send functions
// below throw a clear error instead, only when actually invoked.
const BREVO_CONFIGURED = !!config.BREVO_API_KEY;
if (!BREVO_CONFIGURED) {
  logger.warn('BREVO_API_KEY not set — email sending disabled');
}

// Генерация токена подтверждения
function generateVerificationToken() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Отправка email подтверждения
async function sendVerificationEmail(email, token) {
  if (!BREVO_CONFIGURED) throw new Error('BREVO_API_KEY not configured');
  const verificationUrl = `${config.FRONTEND_URL}/verify-email?token=${token}`;
  
  const emailData = {
    sender: {
      name: 'BikeLab',
      email: 'noreply@bikelab.app'
    },
    to: [
      {
        email: email
      }
    ],
    subject: 'Verify your BikeLab account',
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #274DD3;">Welcome to BikeLab!</h2>
        <p>Thank you for registering. Please click the button below to verify your email address:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" 
             style="background-color: #274DD3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Verify Email
          </a>
        </div>
        <p>Or copy and paste this link in your browser:</p>
        <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't create this account, you can safely ignore this email.</p>
      </div>
    `
  };

  try {
    const response = await axios.post('https://api.brevo.com/v3/smtp/email', emailData, {
      headers: {
        'api-key': config.BREVO_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    return true;
  } catch (error) {
    logger.error({ err: error.response?.data || error.message }, 'Error sending verification email:');
    return false;
  }
}

// Отправка email сброса пароля
async function sendPasswordResetEmail(email, token) {
  if (!BREVO_CONFIGURED) throw new Error('BREVO_API_KEY not configured');
  const resetUrl = `${config.FRONTEND_URL}/reset-password?token=${token}`;
  
  const emailData = {
    sender: {
      name: 'BikeLab',
      email: 'noreply@bikelab.app'
    },
    to: [
      {
        email: email
      }
    ],
    subject: 'Reset your BikeLab password',
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #274DD3;">Password Reset Request</h2>
        <p>You requested to reset your password. Click the button below to set a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" 
             style="background-color: #274DD3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p>Or copy and paste this link in your browser:</p>
        <p style="word-break: break-all; color: #666;">${resetUrl}</p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this reset, you can safely ignore this email.</p>
      </div>
    `
  };

  try {
    const response = await axios.post('https://api.brevo.com/v3/smtp/email', emailData, {
      headers: {
        'api-key': config.BREVO_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    return true;
  } catch (error) {
    logger.error({ err: error.response?.data || error.message }, 'Error sending password reset email:');
    return false;
  }
}

module.exports = {
  generateVerificationToken,
  sendVerificationEmail,
  sendPasswordResetEmail
}; 