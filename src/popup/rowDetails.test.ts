import { describe, expect, it } from 'vitest';
import { formatAdded, formatExact, marqueeParams } from './rowDetails';

describe('formatAdded', () => {
  it('reads as calm prose with month + year', () => {
    expect(formatAdded(Date.UTC(2024, 2, 15), 'en-US')).toBe('Added Mar 2024');
  });
});

describe('formatExact', () => {
  it('carries full precision for the tooltip', () => {
    // Midday UTC keeps the calendar date stable in any test-machine timezone.
    const exact = formatExact(Date.UTC(2024, 2, 15, 12, 0), 'en-US');
    expect(exact).toContain('March 15, 2024');
    expect(exact).toMatch(/\d{1,2}:\d{2}/); // includes a time
  });
});

describe('marqueeParams', () => {
  it('ignores sub-character overflow (not real truncation)', () => {
    expect(marqueeParams(0)).toBeNull();
    expect(marqueeParams(11)).toBeNull();
  });

  it('shifts left by exactly the hidden width', () => {
    expect(marqueeParams(200)?.shiftPx).toBe(-200);
  });

  it('never travels faster than reading speed, with a floor for short trips', () => {
    const short = marqueeParams(20);
    expect(short?.durationS).toBe(3); // floored — a 20px dash would be a blink
    const long = marqueeParams(560);
    expect(long?.durationS).toBe(20); // 560px at 28px/s
  });
});
