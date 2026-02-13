import { ReactNode } from 'react';

export interface DraggableProps {
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
  sortable: {
    setNodeRef: (node: HTMLElement | null) => void;
    transform: import('@dnd-kit/utilities').Transform | null;
    transition: string | undefined;
    setActivatorNodeRef: (element: HTMLElement | null) => void;
    listeners:
      | import('@dnd-kit/core/dist/hooks/utilities').SyntheticListenerMap
      | undefined;
    isDragging: boolean;
  };
}
