import { useMemo } from 'react';
import { FileTrigger } from 'react-aria-components';
import { useTranslation } from 'react-i18next';

import { EditField } from '@/components/EditField/EditField';
import { acceptedFileTypes } from '@/const/image';

import * as cls from './LogoImageField.module.scss';

interface LogoImageFieldProps {
  altI18nKey: string;
  file: File | string;
  selectFile: (file: File | string) => void;
  className?: string;
  currentImageSrc?: string | null;
  alignOnStart?: boolean;
  isLoading?: boolean;
}

export const LogoImageField = ({
  altI18nKey,
  file,
  selectFile,
  className,
  alignOnStart,
  isLoading,
}: LogoImageFieldProps) => {
  const { t } = useTranslation();

  const imageSrc = useMemo(() => {
    if (typeof file === 'string') {
      return file;
    } else {
      return URL.createObjectURL(file);
    }
  }, [file]);

  return (
    <FileTrigger
      acceptedFileTypes={acceptedFileTypes}
      onSelect={(files: FileList | null) => {
        if (files?.length) {
          const file = files[0];
          selectFile(file);
        } else {
          selectFile(file as File);
        }
      }}
    >
      <EditField
        labelKey="Common.buttons.logo"
        className={className}
        alignOnStart={alignOnStart}
        isLoading={isLoading}
      >
        <img
          src={imageSrc}
          alt={t(altI18nKey)}
          className={cls.logo}
        />
      </EditField>
    </FileTrigger>
  );
};
