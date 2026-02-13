import React, { useMemo } from 'react';
import { Toast as ReactToast, resolveValue } from 'react-hot-toast';

import { classNames } from '@/shared/lib/classNames';

import * as cls from './Toast.module.scss';

interface ToastProps {
  toast: ReactToast;
}

export const Toast: React.FC<ToastProps> = ({ toast }) => {
  const className = useMemo(() => {
    if (toast.type === 'success') return cls.success;
    if (toast.type === 'error') return cls.error;
    return undefined;
  }, [toast]);

  return (
    <div className={classNames(cls.Toast, {}, [className])}>
      {resolveValue(toast.message, toast)}
    </div>
  );
};
