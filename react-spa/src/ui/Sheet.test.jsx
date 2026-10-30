import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Sheet from './Sheet';

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(
      <Sheet open={false} onClose={() => {}} title="Rename section">
        Body
      </Sheet>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a modal dialog labelled by its title, described by its subtitle, and takes focus', () => {
    render(
      <Sheet open onClose={() => {}} title="Rename section" subtitle="Every item moves with it.">
        <button>Inner</button>
      </Sheet>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Rename section');
    expect(dialog).toHaveAccessibleDescription('Every item moves with it.');
    expect(dialog).toHaveFocus();
  });

  it('renders the footer slot', () => {
    render(
      <Sheet open onClose={() => {}} title="T" footer={<button>Save</button>}>
        Body
      </Sheet>
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('closes on Escape, on the close button and on backdrop click, but not on content click', () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="T">
        <button>Inner</button>
      </Sheet>
    );
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Inner' }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.mouseDown(screen.getByRole('dialog').parentElement);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('traps Tab focus inside the sheet in both directions', () => {
    render(
      <Sheet open onClose={() => {}} title="T">
        <button>First</button>
        <button>Last</button>
      </Sheet>
    );
    const dialog = screen.getByRole('dialog');

    screen.getByRole('button', { name: 'Last' }).focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('restores focus to the opener on close and applies the variant class', () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <div>
          <button onClick={() => setOpen(true)}>Open</button>
          <Sheet open={open} onClose={() => setOpen(false)} title="T" variant="side">
            Body
          </Sheet>
        </div>
      );
    }
    render(<Harness />);
    const openBtn = screen.getByRole('button', { name: 'Open' });
    openBtn.focus();
    fireEvent.click(openBtn);
    const dialog = screen.getByRole('dialog');
    expect(dialog.parentElement.className).toMatch(/side/);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(openBtn).toHaveFocus();
  });
});
