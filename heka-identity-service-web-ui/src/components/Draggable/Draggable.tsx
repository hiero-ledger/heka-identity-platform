import { CSS } from '@dnd-kit/utilities';

import { DraggableProps } from './types';

export const Draggable = ({
  className,
  style = {},
  children,
  sortable,
}: DraggableProps) => {
  const containerStyle = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    zIndex: sortable.isDragging ? 9999 : 1,
    ...style,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      className={className}
      style={containerStyle}
    >
      {children}
    </div>
  );
};

export const DraggableArea = ({
  children,
  className,
  sortable,
}: DraggableProps) => {
  return (
    <div
      className={className}
      ref={sortable.setActivatorNodeRef}
      {...sortable.listeners}
      style={{ touchAction: 'none' }}
    >
      {children}
    </div>
  );
};
