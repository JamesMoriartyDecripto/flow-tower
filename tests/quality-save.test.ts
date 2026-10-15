import { describe, expect, it } from 'vitest';
import { qualityToSave } from '../src/app/softwareGl';

describe('qualityToSave', () => {
  it('saves the quality when the user chose it', () => {
    expect(qualityToSave(true, 'high')).toBe('high');
    expect(qualityToSave(true, 'eco')).toBe('eco');
  });

  it('leaves the quality out when it was picked automatically', () => {
    expect(qualityToSave(false, 'eco')).toBeUndefined();
  });
});
