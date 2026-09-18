import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ForgotPasswordPage from './ForgotPasswordPage';
import { apiFetch } from '../utils/api';

vi.mock('../utils/api', () => ({
  apiFetch: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('posts the email to /api/forgot-password and shows the no-enumeration message', async () => {
    apiFetch.mockResolvedValueOnce({ message: 'ok' });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'rider@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'rider@example.com' }),
      }),
    );

    expect(await screen.findByText(/password reset link has been sent/i)).toBeInTheDocument();
  });

  it('shows an error message when the request fails', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Network error'));
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'rider@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText('Network error')).toBeInTheDocument();
  });
});
