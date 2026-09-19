import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ForgotPasswordPage from './ForgotPasswordPage';
import { call } from '../data/api';

vi.mock('../data/api', async () => {
  const actual = await vi.importActual('../data/api');
  return { ...actual, call: vi.fn() };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    call.mockReset();
  });

  it('posts the email to /api/forgot-password and shows the no-enumeration message', async () => {
    call.mockResolvedValueOnce({ message: 'ok' });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'rider@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/api/forgot-password' }),
        { body: { email: 'rider@example.com' } },
      ),
    );

    expect(await screen.findByText(/password reset link has been sent/i)).toBeInTheDocument();
  });

  it('shows an error message when the request fails', async () => {
    call.mockRejectedValueOnce(new Error('Network error'));
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'rider@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText('Network error')).toBeInTheDocument();
  });
});
