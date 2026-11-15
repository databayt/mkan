import { describe, expect, it } from 'vitest';
import { settlePending, studioLostTheForm, uploadInProgress, uploadTimeoutMs } from '../../scripts/crm/tiktok-post-pure';

const NOW = Date.parse('2026-11-15T14:00:00Z');
const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();

describe('settlePending', () => {
  it('found on the page after the click: posted', () => {
    const r = settlePending({ K1: iso(90) }, [{ ref: 'K1', at: NOW - 80 * 60_000, url: 'u', id: '1' }], NOW);
    expect(r.posted).toEqual([{ key: 'K1', at: NOW - 80 * 60_000, url: 'u', id: '1' }]);
    expect(r.retry).toEqual([]);
    expect(r.keep).toEqual([]);
  });
  it('an older post of the same ref (before click - 10 min) does not count', () => {
    const r = settlePending({ K1: iso(300) }, [{ ref: 'K1', at: NOW - 2000 * 60_000, url: 'u', id: '1' }], NOW);
    expect(r.posted).toEqual([]);
    expect(r.retry).toEqual(['K1']);
  });
  it('not found, young: kept and waiting, never red', () => {
    const r = settlePending({ K2: iso(45) }, [], NOW);
    expect(r.keep).toEqual(['K2']);
    expect(r.waiting).toEqual(['K2']);
    expect(r.retry).toEqual([]);
  });
  it('under 30 min is not judged at all', () => {
    const r = settlePending({ K2: iso(5) }, null, NOW);
    expect(r.waiting).toEqual(['K2']);
  });
  it('not found, older than 2 h: retry', () => {
    const r = settlePending({ K3: iso(200) }, [{ ref: 'K9', at: NOW, url: 'u', id: '9' }], NOW);
    expect(r.retry).toEqual(['K3']);
    expect(r.keep).toEqual([]);
  });
  it('page unreadable: old keys stay, and are not waiting', () => {
    const r = settlePending({ K4: iso(500) }, null, NOW);
    expect(r.keep).toEqual(['K4']);
    expect(r.waiting).toEqual([]);
    expect(r.retry).toEqual([]);
  });
});

describe('upload gates', () => {
  it('timeout scales with size, 5 to 15 min', () => {
    expect(uploadTimeoutMs(5 * 1024 * 1024)).toBe(300_000);
    expect(uploadTimeoutMs(20 * 1024 * 1024)).toBe(600_000);
    expect(uploadTimeoutMs(27 * 1024 * 1024)).toBe(810_000);
    expect(uploadTimeoutMs(1000 * 1024 * 1024)).toBe(900_000);
  });
  it('reads Studio text', () => {
    expect(uploadInProgress('Content checks Checks can only start after the file is uploaded')).toBe(true);
    expect(uploadInProgress('Uploading 40%')).toBe(true);
    expect(uploadInProgress('Uploaded (27 MB) Post')).toBe(false);
    expect(studioLostTheForm('A video you were editing wasn’t saved')).toBe(true);
    expect(studioLostTheForm('Select video to upload')).toBe(true);
    expect(studioLostTheForm('Description Post')).toBe(false);
  });
});
