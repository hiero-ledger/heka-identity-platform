import { DndContext, DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { Draggable, DraggableArea, useSortableSensors } from './Draggable';
import { DraggableProps } from './types';

const makeSortable = (
  overrides: Partial<DraggableProps['sortable']> = {},
): DraggableProps['sortable'] => ({
  setNodeRef: jest.fn(),
  setActivatorNodeRef: jest.fn(),
  transform: { x: 10, y: 20, scaleX: 1, scaleY: 1 },
  transition: 'transform 200ms',
  listeners: { onPointerDown: jest.fn() },
  isDragging: false,
  ...overrides,
});

describe('Draggable', () => {
  test('applies the sortable transform and registers its node', () => {
    const sortable = makeSortable();

    render(
      <Draggable
        sortable={sortable}
        className="item"
        style={{ width: '10px' }}
      >
        content
      </Draggable>,
    );

    const node = screen.getByText('content');
    expect(node).toHaveClass('item');
    expect(node.style.transform).toBe(
      'translate3d(10px, 20px, 0) scaleX(1) scaleY(1)',
    );
    expect(node.style.transition).toBe('transform 200ms');
    expect(node.style.zIndex).toBe('1');
    expect(node.style.width).toBe('10px');
    expect(sortable.setNodeRef).toHaveBeenCalledWith(node);
  });

  test('raises the item while dragging', () => {
    render(
      <Draggable sortable={makeSortable({ isDragging: true, transform: null })}>
        dragging
      </Draggable>,
    );

    expect(screen.getByText('dragging').style.zIndex).toBe('9999');
  });

  test('DraggableArea attaches the drag listeners to its handle', () => {
    const sortable = makeSortable();

    render(
      <DraggableArea
        sortable={sortable}
        className="handle"
      >
        handle
      </DraggableArea>,
    );

    const handle = screen.getByText('handle');
    expect(sortable.setActivatorNodeRef).toHaveBeenCalledWith(handle);
    expect(handle.style.touchAction).toBe('none');

    fireEvent.pointerDown(handle);
    expect(sortable.listeners!.onPointerDown).toHaveBeenCalled();
  });

  test('DraggableArea is a focusable, labelled handle', () => {
    render(
      <DraggableArea
        sortable={makeSortable({
          attributes: {
            role: 'button',
            tabIndex: 0,
            'aria-disabled': false,
            'aria-pressed': undefined,
            'aria-roledescription': 'sortable',
            'aria-describedby': 'dnd-instructions',
          },
        })}
        label="Move template"
      >
        handle
      </DraggableArea>,
    );

    const handle = screen.getByRole('button', { name: 'Move template' });
    expect(handle).toHaveAttribute('tabindex', '0');
    expect(handle).toHaveAttribute('aria-roledescription', 'sortable');
  });
});

describe('keyboard sorting', () => {
  const ITEM_HEIGHT = 40;

  const Item = ({ id }: { id: string }) => {
    const sortable = useSortable({ id });
    return (
      <Draggable sortable={sortable}>
        <DraggableArea
          sortable={sortable}
          label={`Move ${id}`}
        >
          {id}
        </DraggableArea>
      </Draggable>
    );
  };

  const List = ({ onDragEnd }: { onDragEnd: (e: DragEndEvent) => void }) => {
    const sensors = useSortableSensors();
    const ids = ['first', 'second', 'third'];
    return (
      <DndContext
        sensors={sensors}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={ids}
          strategy={verticalListSortingStrategy}
        >
          {ids.map((id) => (
            <Item
              key={id}
              id={id}
            />
          ))}
        </SortableContext>
      </DndContext>
    );
  };

  beforeEach(() => {
    // jsdom has no layout: stack the items vertically by their position in the document
    jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const items = Array.from(
          document.querySelectorAll('[aria-roledescription="sortable"]'),
        ).map((handle) => handle.parentElement);
        const index = Math.max(items.indexOf(this), 0);
        const top = index * ITEM_HEIGHT;
        return {
          x: 0,
          y: top,
          top,
          left: 0,
          width: 200,
          height: ITEM_HEIGHT,
          right: 200,
          bottom: top + ITEM_HEIGHT,
          toJSON: () => ({}),
        } as DOMRect;
      });
  });

  afterEach(() => jest.restoreAllMocks());

  // dnd-kit measures the drop targets asynchronously once a drag starts
  const settle = () =>
    act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));

  test('moves an item with Space and the arrow keys alone', async () => {
    const onDragEnd = jest.fn();
    render(<List onDragEnd={onDragEnd} />);

    const handle = screen.getByRole('button', { name: 'Move first' });
    handle.focus();
    expect(handle).toHaveFocus();

    fireEvent.keyDown(handle, { code: 'Space' });
    await settle();
    fireEvent.keyDown(handle, { code: 'ArrowDown' });
    await settle();
    fireEvent.keyDown(handle, { code: 'Space' });
    await settle();

    expect(onDragEnd).toHaveBeenCalledTimes(1);
    const event = onDragEnd.mock.calls[0][0] as DragEndEvent;
    expect(event.active.id).toBe('first');
    expect(event.over?.id).toBe('second');
  });
});
