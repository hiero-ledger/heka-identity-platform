import i18n from '@/translations';

import { getConnectionLabel, getConnectionName } from './connectionLabel';

const t = i18n.t.bind(i18n);

describe('connectionLabel', () => {
  test('uses the alias when present', () => {
    expect(getConnectionName({ id: 'abcdef1234', alias: ' Alice ' }, t)).toBe(
      'Alice',
    );
  });

  test('falls back to an unnamed label with the id prefix', () => {
    expect(getConnectionName({ id: 'abcdef1234' }, t)).toBe(
      'Unnamed connection (abcdef12)',
    );
    expect(getConnectionName({ id: 'abcdef1234', alias: '  ' }, t)).toBe(
      'Unnamed connection (abcdef12)',
    );
  });

  test('never shows the holder label', () => {
    const connection = {
      id: 'abcdef1234',
      theirLabel: 'didcomm-oob-invitation',
      createdAt: '2026-10-02T10:00:00Z',
    };

    expect(getConnectionLabel(connection, t)).not.toContain(
      'didcomm-oob-invitation',
    );
  });

  test('appends the creation date and skips an invalid one', () => {
    expect(
      getConnectionLabel(
        { id: 'abcdef1234', alias: 'Alice', createdAt: '2026-10-02T10:00:00Z' },
        t,
      ),
    ).toMatch(/^Alice · .*2026/);
    expect(
      getConnectionLabel(
        { id: 'abcdef1234', alias: 'Alice', createdAt: 'not a date' },
        t,
      ),
    ).toBe('Alice');
  });
});
