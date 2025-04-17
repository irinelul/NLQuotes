import { expect, test } from 'vitest'
import { backdateTimestamp, formatDate, formatTimestamp } from './dateHelpers'

test('backdateTimestamp works correctly', () => {
  expect(backdateTimestamp(0)).toBe(0);
  expect(backdateTimestamp(1)).toBe(0);
  expect(backdateTimestamp(1000)).toBe(999);
})

test('formatDate formats correctly', () => {
  expect(formatDate('20220103')).toBe("03 January 2022");
  expect(formatDate('1989-12-13')).toBe("13 December 1989");
  expect(formatDate(new Date("2024-02-01"))).toBe("01 February 2024");

  expect(formatDate(null)).toBe("N/A");
  expect(formatDate('costco')).toBe("Invalid Date");
})

test('formatTimestamp formats correctly', () => {
  expect(formatTimestamp(3600)).toBe("01:00:00");
  expect(formatTimestamp(60)).toBe("01:00");
  expect(formatTimestamp(6)).toBe("00:06");
  expect(formatTimestamp(null)).toBe("00:00");
  expect(formatTimestamp('costco')).toBe("00:00");
})