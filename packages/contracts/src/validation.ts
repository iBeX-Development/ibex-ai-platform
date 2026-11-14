import { z } from 'zod';

// Existing UTC contract permits minute precision, optional seconds and fractional seconds.
// Validate the calendar date separately without normalizing the original timestamp.
const utcDateTime = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?Z$/;
const calendarDate = z.iso.date();
export const utcDateTimeSchema = z.string().refine((value) => {
  const match = utcDateTime.exec(value);
  return match !== null && calendarDate.safeParse(match[1]).success;
}, 'Invalid datetime');

// Preserve the prior URL constructor validation and exact input; this is not URL normalization.
export const exactUrlSchema = z.string().refine((value) => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}, 'Invalid url');
