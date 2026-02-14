import type { Meta, StoryObj } from '@storybook/react';

import { Button } from './Button';
const meta = {
  title: 'shared/Buttons',
  component: Button,
  tags: ['autodocs'],
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Filled: Story = {
  args: {
    children: 'Button',
    buttonType: 'filled',
  },
};

export const FilledDisabled: Story = {
  args: {
    children: 'Button',
    buttonType: 'filled',
    isDisabled: true,
  },
};

export const Outlined: Story = {
  args: {
    children: 'Button',
    buttonType: 'outlined',
  },
};

export const OutlinedDisabled: Story = {
  args: {
    children: 'Button',
    buttonType: 'outlined',
    isDisabled: true,
  },
};

export const Tonal: Story = {
  args: {
    children: 'Button',
    buttonType: 'tonal',
  },
};

export const TonalDisabled: Story = {
  args: {
    children: 'Button',
    buttonType: 'tonal',
    isDisabled: true,
  },
};

export const Elevated: Story = {
  args: {
    children: 'Button',
    buttonType: 'elevated',
  },
};

export const ElevatedDisabled: Story = {
  args: {
    children: 'Button',
    buttonType: 'elevated',
    isDisabled: true,
  },
};

export const Text: Story = {
  args: {
    children: 'Button',
    buttonType: 'text',
  },
};

export const TextDisabled: Story = {
  args: {
    children: 'Button',
    buttonType: 'text',
    isDisabled: true,
  },
};

export const WithLeftIcon: Story = {
  args: {
    children: 'Button',
    buttonType: 'filled',
    leftIcon: 'arrow-back',
  },
};

export const WithRightIcon: Story = {
  args: {
    children: 'Button',
    buttonType: 'filled',
    rightIcon: 'forward',
  },
};

export const WithIcons: Story = {
  args: {
    children: 'Button',
    buttonType: 'filled',
    leftIcon: 'add',
    rightIcon: 'add',
  },
};
