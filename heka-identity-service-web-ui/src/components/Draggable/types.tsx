import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from '@dnd-kit/core';
import { ReactNode } from 'react';

export interface DraggableProps {
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
  /** Accessible name of the drag handle (`DraggableArea`), e.g. "Move template" */
  label?: string;
  sortable: {
    setNodeRef: (node: HTMLElement | null) => void;
    transform: import('@dnd-kit/utilities').Transform | null;
    transition: string | undefined;
    setActivatorNodeRef: (element: HTMLElement | null) => void;
    listeners: DraggableSyntheticListeners;
    /** Focus and ARIA attributes that make the handle usable from the keyboard */
    attributes?: DraggableAttributes;
    isDragging: boolean;
  };
}
