import { describe, expect, it } from 'vitest';
import { z } from 'zod';

describe('patched Zod bounded collection validation', () => {
  it('rejects an oversized synthetic array before evaluating its elements', () => {
    let visited = 0;
    const schema = z
      .array(
        z.string().refine(() => {
          visited += 1;
          return true;
        })
      )
      .max(2);
    expect(schema.safeParse(['one', 'two', 'three']).success).toBe(false);
    expect(visited).toBe(0);
    expect(schema.safeParse(['one', 'two']).success).toBe(true);
    expect(visited).toBe(2);
  });
});
