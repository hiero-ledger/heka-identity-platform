import type { Meta, StoryObj } from '@storybook/react';

import { Select } from './Select';

const meta = {
  title: 'shared/Select',
  component: Select,
  tags: ['autodocs'],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

const items = [
  { value: '1', content: 'First' },
  { value: '2', content: 'Second' },
  { value: '3', content: 'Third' },
];

export const Default: Story = {
  args: {
    items,
  },
};

export const WithDefaultValue: Story = {
  args: {
    items,
    defaultSelectedKey: '2',
  },
};

export const WithDescription: Story = {
  args: {
    items,
    description: "Well, here's a hint.",
  },
};

export const WithPlaceholder: Story = {
  args: {
    items,
    placeholder: 'Placeholder',
  },
};

export const WithLongItemsList: Story = {
  args: {
    items: [
      { value: '1', content: '1' },
      { value: '12', content: '12' },
      { value: '13', content: '13' },
      { value: '14', content: '14' },
      { value: '51', content: '51' },
      { value: '16', content: '16' },
      { value: '17', content: '17' },
      { value: '18', content: '18' },
      { value: '19', content: '19' },
      { value: '10', content: '10' },
      { value: '111', content: '111' },
      { value: '122', content: '222' },
      { value: '133', content: '333' },
      { value: '144', content: '44' },
      { value: '155', content: '55' },
      { value: '166', content: '66' },
      { value: '177', content: '77' },
      { value: '188', content: '88' },
      { value: '199', content: '99' },
      { value: '100', content: '00' },
    ],
    placeholder: 'Placeholder',
  },
};

export const Disabled: Story = {
  args: {
    items,
    isDisabled: true,
    placeholder: 'Placeholder',
    defaultSelectedKey: '2',
    description: "Well, here's a hint.",
  },
};

export const WithDisabledItem: Story = {
  args: {
    items: [
      { value: '1', content: 'First' },
      { value: '2', content: 'Second', isDisabled: true },
      { value: '3', content: 'Third' },
    ],
  },
};

export const Error: Story = {
  args: {
    items,
    isInvalid: true,
    errorMessage: 'Error message',
  },
};
