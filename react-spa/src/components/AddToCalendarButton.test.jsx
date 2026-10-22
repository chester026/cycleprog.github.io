import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AddToCalendarButton from './AddToCalendarButton';

const events = [
  { id: 31, type: 'planned_ride', title: 'Tempo ride', start_date: '2026-10-20', start_time: '07:00:00', end_time: '08:00:00' },
  { id: 34, type: 'rest_day', title: 'Rest', start_date: '2026-10-25' },
];

describe('AddToCalendarButton', () => {
  afterEach(() => vi.restoreAllMocks());

  it('builds the .ics in the browser and downloads it through a Blob URL — no network', async () => {
    let blob;
    const createObjectURL = vi.fn((b) => {
      blob = b;
      return 'blob:test';
    });
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<AddToCalendarButton events={events} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 events to calendar (.ics)' }));

    expect(click).toHaveBeenCalledTimes(1);
    expect(blob.type).toBe('text/calendar;charset=utf-8');
    // jsdom's Blob has no text(); FileReader does the same job.
    const text = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(blob);
    });
    expect(text).toContain('BEGIN:VCALENDAR');
    expect(text).toContain('UID:31@bikelab.app');
    expect(text).toContain('DTSTART:20261020T070000');
    expect(text).toContain('DTSTART;VALUE=DATE:20261025');
    expect(text).toContain('SUMMARY:Rest');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('uses the singular label for one event and renders nothing for none', () => {
    const { container, rerender } = render(<AddToCalendarButton events={[events[0]]} />);
    expect(screen.getByRole('button', { name: 'Add to calendar (.ics)' })).toBeInTheDocument();
    rerender(<AddToCalendarButton events={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('compact mode keeps the download button but drops the hint line', () => {
    render(<AddToCalendarButton events={[events[0]]} compact />);
    expect(screen.getByRole('button', { name: 'Add to calendar (.ics)' })).toBeInTheDocument();
    expect(screen.queryByText('Downloads a file your calendar app can import.')).not.toBeInTheDocument();
  });
});
