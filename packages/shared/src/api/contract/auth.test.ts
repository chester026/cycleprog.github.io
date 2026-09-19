import { describe, it, expect } from 'vitest';
import { auth } from './auth.js';

describe('auth contract', () => {
  it('login: accepts a real server payload (token + refreshToken + user)', () => {
    const r = auth.login.response.safeParse({
      token: 'jwt',
      refreshToken: 'refresh-jwt',
      user: { id: 1, email: 'rider@example.com', created_at: '2026-01-01T00:00:00.000Z' },
    });
    expect(r.success).toBe(true);
  });

  it('login body: rejects a missing password', () => {
    expect(auth.login.body.safeParse({ email: 'a@b.com' }).success).toBe(false);
  });

  it('register: accepts the success payload', () => {
    const r = auth.register.response.safeParse({
      success: true,
      message: 'Registration successful. Please check your email to verify your account.',
      user: { id: 5, email: 'new@example.com', name: 'New User' },
    });
    expect(r.success).toBe(true);
  });

  it('exchange: accepts token + refreshToken + user (S-14 additive field)', () => {
    const r = auth.exchange.response.safeParse({
      token: 'jwt',
      refreshToken: 'refresh-jwt',
      user: { id: 1, name: 'Rider', avatar: null, email: 'rider@example.com' },
    });
    expect(r.success).toBe(true);
  });

  it('strava start: accepts {url} and a client query of "mobile" or "web"', () => {
    expect(auth.stravaStart.response.safeParse({ url: 'https://strava.com/oauth/authorize?state=x' }).success).toBe(true);
    expect(auth.stravaStart.query!.safeParse({ client: 'mobile' }).success).toBe(true);
    expect(auth.stravaStart.query!.safeParse({}).success).toBe(true);
  });

  it('refresh: accepts a rotated (token, refreshToken) pair', () => {
    expect(auth.refresh.response.safeParse({ token: 'jwt', refreshToken: 'new-refresh' }).success).toBe(true);
  });

  it('logout/logout-all: accept {success: true}, logout body is optional', () => {
    expect(auth.logout.response.safeParse({ success: true }).success).toBe(true);
    expect(auth.logout.body!.safeParse({}).success).toBe(true);
    expect(auth.logoutAll.response.safeParse({ success: true }).success).toBe(true);
  });

  it('unlinkStrava: accepts a fresh token', () => {
    expect(auth.unlinkStrava.response.safeParse({ token: 'jwt' }).success).toBe(true);
  });

  it('message endpoints: accept {message}', () => {
    expect(auth.verifyEmail.response.safeParse({ message: 'Email verified successfully' }).success).toBe(true);
    expect(auth.forgotPassword.response.safeParse({ message: 'If an account with that email exists, a password reset link has been sent.' }).success).toBe(true);
    expect(auth.resetPassword.response.safeParse({ message: 'Password reset successful' }).success).toBe(true);
    expect(auth.resendVerification.response.safeParse({ message: 'Verification email sent successfully' }).success).toBe(true);
  });
});
