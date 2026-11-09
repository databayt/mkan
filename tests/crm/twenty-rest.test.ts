import { describe, it, expect } from 'vitest';
import { isTransientTwenty } from '../../scripts/crm/twenty-rest';

describe('isTransientTwenty', () => {
  it('retries Twenty query read timeouts (400)', () => {
    expect(isTransientTwenty(400, '{"messages":["Query read timeout"],"code":"QUERY_READ_TIMEOUT"}')).toBe(true);
  });
  it('retries dropped connections and 5xx', () => {
    expect(isTransientTwenty(null, '')).toBe(true);
    expect(isTransientTwenty(502, '')).toBe(true);
  });
  it('keeps real 400s and 404s fatal', () => {
    expect(isTransientTwenty(400, '{"messages":["Invalid cursor"]}')).toBe(false);
    expect(isTransientTwenty(404, '')).toBe(false);
  });
});
