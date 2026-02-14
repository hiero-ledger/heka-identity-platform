import { Button } from '@/shared/ui/Button';
import { Row } from '@/shared/ui/Grid';

import { NoItemFoundProps } from './types';

import * as cls from './NoItemFound.module.scss';

export const NoItemFound = ({
  title,
  description,
  buttonTitle,
  onClick,
}: NoItemFoundProps) => {
  return (
    <Row className={cls.NoItemFoundWrapper}>
      <Row className={cls.ItemsContainer}>
        <h3 className={cls.title}>{title}</h3>
        {description && <p className={cls.description}>{description}</p>}
        {buttonTitle && <Button onPress={onClick}>{buttonTitle}</Button>}
      </Row>
    </Row>
  );
};
