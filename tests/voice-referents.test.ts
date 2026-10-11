import { beforeEach, describe, expect, it } from 'vitest';
import { clearList, currentList, setList, stepIndex, stepList } from '../src/app/voice/referents';

/** The list the user was last shown: what "il prossimo" / "the next one" refers to (#130). */
describe('voice list referents (#130)', () => {
  beforeEach(() => clearList());

  it('steps inside the list and stops at both ends', () => {
    expect(stepIndex(3, 0, 1)).toBe(1);
    expect(stepIndex(3, 1, 1)).toBe(2);
    expect(stepIndex(3, 2, 1)).toBeUndefined();
    expect(stepIndex(3, 1, -1)).toBe(0);
    expect(stepIndex(3, 0, -1)).toBeUndefined();
  });

  it('has no step in an empty list', () => {
    expect(stepIndex(0, -1, 1)).toBeUndefined();
    expect(stepIndex(0, 0, -1)).toBeUndefined();
  });

  it('walks a list set for the tower on screen', () => {
    setList({ tower: 'a', keys: ['x', 'y', 'z'], cursor: -1, source: 'search' });
    expect(currentList('a')?.keys).toEqual(['x', 'y', 'z']);
    expect(stepList(1)).toBe('x');
    expect(stepList(1)).toBe('y');
    expect(currentList('a')?.cursor).toBe(1);
    expect(stepList(-1)).toBe('x');
    expect(stepList(-1)).toBeUndefined();
    expect(currentList('a')?.cursor).toBe(0);
  });

  it('returns nothing at the end of the list', () => {
    setList({ tower: 'a', keys: ['only'], cursor: 0, source: 'layer' });
    expect(stepList(1)).toBeUndefined();
  });

  it('ignores a list from another tower', () => {
    setList({ tower: 'a', keys: ['x'], cursor: -1, source: 'layer' });
    expect(currentList('b')).toBeUndefined();
    expect(stepList(1)).toBeUndefined();
  });

  it('forgets the list on clear', () => {
    setList({ tower: 'a', keys: ['x'], cursor: -1, source: 'layer' });
    clearList();
    expect(currentList('a')).toBeUndefined();
  });
});
