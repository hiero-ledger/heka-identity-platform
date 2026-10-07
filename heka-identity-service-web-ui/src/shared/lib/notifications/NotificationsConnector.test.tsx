import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';

import { userActions } from '@/entities/User';
import { createTestStore } from '@/shared/lib/tests/renderWithProviders';

import { connect, disconnect } from './notificationClient';
import { NotificationsConnector } from './NotificationsConnector';

jest.mock('./notificationClient', () => ({
  connect: jest.fn(),
  disconnect: jest.fn(),
}));

const renderConnector = (accessToken: string | null) => {
  const store = createTestStore({
    user: {
      isLoading: false,
      isPreparing: false,
      data: { tokens: { accessToken } },
    },
  });
  const view = render(
    <Provider store={store}>
      <NotificationsConnector />
    </Provider>,
  );
  return { store, ...view };
};

describe('NotificationsConnector', () => {
  test('stays disconnected while signed out', () => {
    renderConnector(null);

    expect(connect).not.toHaveBeenCalled();
  });

  test('connects on sign-in and disconnects on sign-out', () => {
    const { store } = renderConnector(null);

    act(() => {
      store.dispatch(userActions.setSession({ accessToken: 'tok', name: 'A' }));
    });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();

    act(() => {
      store.dispatch(userActions.clearSession());
    });
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  test('disconnects when unmounted', () => {
    const { unmount } = renderConnector('tok');
    expect(connect).toHaveBeenCalledTimes(1);

    unmount();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
