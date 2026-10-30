import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RegisterPage from './RegisterPage';
import { call } from '../data/api';

vi.mock('../data/api', async () => {
  const actual = await vi.importActual('../data/api');
  return { ...actual, call: vi.fn() };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>,
  );
}

function submit() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter22' } });
  fireEvent.change(screen.getByLabelText('Repeat password'), { target: { value: 'hunter22' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
}

describe('RegisterPage', () => {
  beforeEach(() => {
    call.mockReset();
  });

  it('registers through POST /api/register and tells the user to verify their email', async () => {
    call.mockResolvedValueOnce({ message: 'ok' });
    renderPage();
    submit();

    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/api/register' }),
        { body: { email: 'new@example.com', password: 'hunter22' } },
      ),
    );
    expect(await screen.findByText(/Registration successful!/)).toBeInTheDocument();
    // The form stays: the account is unusable until the email is confirmed.
    expect(screen.getByRole('button', { name: 'Sign Up' })).toBeInTheDocument();
  });

  it('shows the server error when registration fails', async () => {
    call.mockRejectedValueOnce(new Error('Email already registered'));
    renderPage();
    submit();
    expect(await screen.findByText('Email already registered')).toBeInTheDocument();
    expect(screen.queryByText(/Registration successful!/)).not.toBeInTheDocument();
  });

  it('links back to sign in', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Sign In' })).toHaveAttribute('href', '/login');
  });
});
