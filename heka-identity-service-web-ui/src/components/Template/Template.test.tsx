import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import '@/translations';

import { Template } from './Template';

const renderTemplate = () => {
  const props = {
    id: 'tpl-1',
    title: 'KYC basic',
    targetDescription: 'Schema: Passport',
    onClick: jest.fn(),
    onEdit: jest.fn(),
    onDelete: jest.fn(),
  };
  render(
    <DndContext>
      <SortableContext items={['tpl-1']}>
        <Template {...props} />
      </SortableContext>
    </DndContext>,
  );
  return props;
};

describe('Template', () => {
  test('renders the title and opens the template on click', async () => {
    const user = userEvent.setup();
    const props = renderTemplate();

    const title = screen.getByText('KYC basic');
    expect(title).toHaveAttribute('title', 'Schema: Passport');
    expect(screen.getByTitle('Move template')).toBeInTheDocument();

    await user.click(title);
    expect(props.onClick).toHaveBeenCalledWith('tpl-1');
  });

  test('opens the template from the keyboard', async () => {
    const user = userEvent.setup();
    const props = renderTemplate();

    const card = screen.getByRole('button', { name: 'KYC basic' });
    expect(card).toHaveAttribute('tabindex', '0');
    card.focus();
    await user.keyboard('{Enter}');

    expect(props.onClick).toHaveBeenCalledWith('tpl-1');
  });

  test('edits the template from its menu', async () => {
    const user = userEvent.setup();
    const props = renderTemplate();

    await user.click(screen.getByTitle('Actions').querySelector('button')!);
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));

    expect(props.onEdit).toHaveBeenCalledWith('tpl-1');
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  test('deletes the template from its menu', async () => {
    const user = userEvent.setup();
    const props = renderTemplate();

    await user.click(screen.getByTitle('Actions').querySelector('button')!);
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(props.onDelete).toHaveBeenCalledWith('tpl-1');
  });
});
