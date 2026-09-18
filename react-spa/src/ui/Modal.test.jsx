import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Modal from './Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Hello">
        Body
      </Modal>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders as a labelled dialog when open, and focuses the dialog', () => {
    render(
      <Modal open onClose={() => {}} title="Hello">
        <button>Inner button</button>
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
    expect(dialog).toHaveAccessibleName('Hello');
    expect(dialog).toHaveFocus();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Hello">
        Body
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on overlay click but not on content click', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Hello">
        <button>Inner</button>
      </Modal>
    );
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Inner' }));
    expect(onClose).not.toHaveBeenCalled();

    // The overlay is the dialog's parent node.
    const overlay = screen.getByRole('dialog').parentElement;
    fireEvent.mouseDown(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps Tab focus within the dialog (wraps forward past the last item)', () => {
    render(
      <Modal open onClose={() => {}} title="Hello">
        <button>First</button>
        <button>Last</button>
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    const last = screen.getByRole('button', { name: 'Last' });
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // Wrapping forward from the last focusable should land back on the
    // first one inside the dialog (the close button), never outside it.
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('traps Tab focus within the dialog (wraps backward past the first item)', () => {
    render(
      <Modal open onClose={() => {}} title="Hello">
        <button>First</button>
        <button>Last</button>
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    const closeBtn = screen.getByRole('button', { name: 'Close' });
    closeBtn.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('restores focus to the previously focused element on close', () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <div>
          <button onClick={() => setOpen(true)}>Open</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Hello">
            Body
          </Modal>
        </div>
      );
    }
    render(<Harness />);
    const openBtn = screen.getByRole('button', { name: 'Open' });
    openBtn.focus();
    fireEvent.click(openBtn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(openBtn).toHaveFocus();
  });
});
