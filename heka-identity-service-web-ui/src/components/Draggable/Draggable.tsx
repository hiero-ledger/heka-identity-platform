import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
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

/** The drag handle: focusable, and operable with Space/Enter and the arrow keys */
export const DraggableArea = ({
  children,
  className,
  label,
  sortable,
}: DraggableProps) => {
  return (
    <div
      className={className}
      ref={sortable.setActivatorNodeRef}
      {...sortable.attributes}
      {...sortable.listeners}
      aria-label={label}
      style={{ touchAction: 'none' }}
    >
      {children}
    </div>
  );
};

/** Pointer and keyboard sensors for a sortable list; pass to `<DndContext sensors={...}>` */
export const useSortableSensors = () =>
  useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
