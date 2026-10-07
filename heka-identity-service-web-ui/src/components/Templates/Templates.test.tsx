import { DragEndEvent } from '@dnd-kit/core';
import { act, render, screen } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { IssuanceTemplate } from '@/entities/IssuanceTemplate';

import { Templates } from './Templates';
import { TemplatesProps, TemplateType } from './types';

// Capture the drag handler instead of simulating pointer gestures in jsdom
let onDragEnd: ((event: DragEndEvent) => Promise<void>) | undefined;
jest.mock('@dnd-kit/core', () => ({
  ...jest.requireActual('@dnd-kit/core'),
  DndContext: ({
    children,
    onDragEnd: handler,
  }: PropsWithChildren<{ onDragEnd: typeof onDragEnd }>) => {
    onDragEnd = handler;
    return <>{children}</>;
  },
}));
jest.mock('@dnd-kit/sortable', () => ({
  ...jest.requireActual('@dnd-kit/sortable'),
  SortableContext: ({ children }: PropsWithChildren) => <>{children}</>,
}));

let search: (query: string) => void = () => {};
jest.mock('@/shared/ui/Search/Search', () => ({
  Search: ({ onSearch }: { onSearch: (query: string) => void }) => {
    search = onSearch;
    return null;
  },
}));
jest.mock('@/components/Template/Template', () => ({
  Template: ({ title }: { title: string }) => (
    <div data-testid="template">{title}</div>
  ),
}));
jest.mock('../PlusButton', () => ({ PlusButton: () => null }));
jest.mock('@/components/NoItemFound/NoItemFound', () => ({
  NoItemFound: () => null,
}));
jest.mock('@/components/Screen/Screen', () => ({
  DesktopView: ({ children }: PropsWithChildren) => <>{children}</>,
}));
jest.mock('@/shared/ui/Loader', () => ({ LoaderView: () => null }));
jest.mock('@/shared/ui/ConfirmDialog', () => ({
  __esModule: true,
  default: () => ({ dialogProps: {}, confirm: jest.fn() }),
  ConfirmForm: () => null,
}));

const template = (id: string, name: string) =>
  ({ id, name }) as IssuanceTemplate;

const templates = [
  template('t1', 'KYC basic'),
  template('t2', 'Employee badge'),
  template('t3', 'KYC full'),
  template('t4', 'Diploma'),
];

// Mirrors dnd-kit: `sortable.index` is the position in the rendered (filtered) list
const dragEvent = (
  [activeId, activeIndex]: [string, number],
  [overId, overIndex]: [string, number],
) =>
  ({
    active: {
      id: activeId,
      data: { current: { sortable: { index: activeIndex } } },
    },
    over: { id: overId, data: { current: { sortable: { index: overIndex } } } },
  }) as unknown as DragEndEvent;

const renderTemplates = (
  changeTemplateOrder: TemplatesProps['changeTemplateOrder'],
) =>
  render(
    <MemoryRouter>
      <Templates
        templateType={TemplateType.Issue}
        templatesState={{ templates, isLoading: false, error: '' }}
        changeTemplateOrder={changeTemplateOrder}
        deleteTemplate={jest.fn()}
        navigateOnCreateTemplate="/create"
        navigateOnEditTemplate="/edit"
        navigateOnOpenTemplate="/open"
      />
    </MemoryRouter>,
  );

const shownTitles = () =>
  screen.getAllByTestId('template').map((el) => el.textContent);

describe('Templates reordering', () => {
  test('reorders by id in the full list while a search filter is active', async () => {
    const changeTemplateOrder = jest.fn().mockResolvedValue(undefined);
    renderTemplates(changeTemplateOrder);

    act(() => search('kyc'));
    expect(shownTitles()).toEqual(['KYC basic', 'KYC full']);

    // Visible indexes are 1 -> 0, but in the full list t3 sits at index 2
    await act(() => onDragEnd!(dragEvent(['t3', 1], ['t1', 0])));

    expect(changeTemplateOrder).toHaveBeenCalledWith('t3', null);
    expect(shownTitles()).toEqual(['KYC full', 'KYC basic']);

    act(() => search(''));
    expect(shownTitles()).toEqual([
      'KYC full',
      'KYC basic',
      'Employee badge',
      'Diploma',
    ]);
  });

  test('sends the template now placed before the moved one', async () => {
    const changeTemplateOrder = jest.fn().mockResolvedValue(undefined);
    renderTemplates(changeTemplateOrder);

    await act(() => onDragEnd!(dragEvent(['t1', 0], ['t3', 2])));

    expect(changeTemplateOrder).toHaveBeenCalledWith('t1', 't3');
    expect(shownTitles()).toEqual([
      'Employee badge',
      'KYC full',
      'KYC basic',
      'Diploma',
    ]);
  });

  test('restores the previous order when the update fails', async () => {
    const changeTemplateOrder = jest
      .fn()
      .mockRejectedValue(new Error('Request failed'));
    renderTemplates(changeTemplateOrder);

    await act(() => onDragEnd!(dragEvent(['t4', 3], ['t1', 0])));

    expect(changeTemplateOrder).toHaveBeenCalledWith('t4', null);
    expect(shownTitles()).toEqual([
      'KYC basic',
      'Employee badge',
      'KYC full',
      'Diploma',
    ]);
  });
});
