import { describe, expect, it, vi } from 'vitest';
import { backupFilename, downloadJson } from './backup';

describe('backupFilename', () => {
  it('names all-data and single-month exports differently', () => {
    expect(backupFilename()).toMatch(/^monthly-task-tracker-all-\d{4}-\d{2}-\d{2}\.json$/);
    expect(backupFilename('2026-08')).toMatch(
      /^monthly-task-tracker-2026-08-\d{4}-\d{2}-\d{2}\.json$/,
    );
  });
});

describe('downloadJson', () => {
  it('serialises the payload and triggers a download', () => {
    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadJson('backup.json', { hello: 'world' });

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
    // The anchor is cleaned up rather than left in the document.
    expect(document.querySelector('a[download]')).toBeNull();

    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
