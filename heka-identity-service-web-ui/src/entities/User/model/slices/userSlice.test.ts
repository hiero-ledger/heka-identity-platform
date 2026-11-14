import { agencyApi } from '@/shared/api/rtk/agencyApi';

import { userActions, userReducer } from './userSlice';
import { PreparedDid, prepareWallet } from '../services/prepareWallet';
import { signOut } from '../services/signOut';
import { UserSchema } from '../types/user';

const initial = () => userReducer(undefined, { type: '@@INIT' });

const prepared = (statuses: PreparedDid['status'][]) =>
  prepareWallet.fulfilled(
    {
      did: 'did:key:main',
      dids: statuses.map((status, i) => ({ method: `m${i}`, status })),
    },
    'req-1',
  );

const preparedState = (): UserSchema => ({
  ...initial(),
  isWalletPrepared: true,
});

describe('userSlice isWalletPrepared', () => {
  test('is unset initially', () => {
    expect(initial().isWalletPrepared).toBe(false);
  });

  test.each([
    [['created', 'existing'], true],
    [['existing', 'existing'], true],
    [['existing', 'skipped'], true],
    [[], true],
    [['created', 'failed'], false],
    [['existing', 'failed', 'skipped'], false],
  ] as const)(
    'a preparation with DIDs %j sets it to %s',
    (statuses, expected) => {
      const state = userReducer(initial(), prepared([...statuses]));

      expect(state.isWalletPrepared).toBe(expected);
      expect(state.isPreparing).toBe(false);
      expect(state.data?.did).toBe('did:key:main');
    },
  );

  test('a rejected preparation leaves it unset', () => {
    const state = userReducer(
      initial(),
      prepareWallet.rejected(null, 'req-1', undefined, 'down'),
    );

    expect(state.isWalletPrepared).toBe(false);
    expect(state.error).toBe('down');
  });

  test.each([
    ['reset', userActions.reset()],
    ['clearSession (dropped session)', userActions.clearSession()],
    ['signOut.pending', signOut.pending('req-1')],
    ['signOut.fulfilled', signOut.fulfilled(undefined, 'req-1')],
    ['a cache reset (user change)', agencyApi.util.resetApiState()],
  ])('is cleared by %s', (_name, action) => {
    expect(userReducer(preparedState(), action).isWalletPrepared).toBe(false);
  });

  test('a token renewal (setSession) keeps it', () => {
    const state = userReducer(
      preparedState(),
      userActions.setSession({ accessToken: 'renewed', name: 'Ada' }),
    );

    expect(state.isWalletPrepared).toBe(true);
  });
});
