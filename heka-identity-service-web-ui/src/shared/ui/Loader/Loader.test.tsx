import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Column, Row } from '@/shared/ui/Grid';
import { Stepper } from '@/shared/ui/Stepper';

import { Loader, LoaderView } from './Loader';
import { LoaderType } from './types';

describe('Loader', () => {
  test.each([undefined, LoaderType.Circular, LoaderType.Linear])(
    'renders a %s spinner',
    (type) => {
      const { container } = render(
        <Loader
          type={type}
          size={24}
        />,
      );

      expect(container.firstChild).toBeInTheDocument();
    },
  );

  test('renders nothing for an unknown type', () => {
    const { container } = render(<Loader type={'unknown' as LoaderType} />);

    expect(container).toBeEmptyDOMElement();
  });

  test('LoaderView centers a spinner in a row', () => {
    const { container } = render(<LoaderView />);

    expect(container.firstChild).toHaveStyle({ justifyContent: 'center' });
  });
});

describe('Grid', () => {
  test('Row passes layout props and handles clicks', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();

    render(
      <Row
        className="extra"
        justifyContent="center"
        alignItems="flex-end"
        alignSelf="center"
        onClick={onClick}
      >
        row content
      </Row>,
    );

    const row = screen.getByText('row content');
    expect(row).toHaveClass('extra');
    expect(row).toHaveStyle({
      justifyContent: 'center',
      alignItems: 'flex-end',
      alignSelf: 'center',
    });

    await user.click(row);
    expect(onClick).toHaveBeenCalled();
  });

  test('Column renders a bordered column', () => {
    render(
      <Column
        bordered
        justifyContent="space-between"
        style={{ width: '10px' }}
      >
        column content
      </Column>,
    );

    const column = screen.getByText('column content');
    expect(column).toHaveStyle({
      justifyContent: 'space-between',
      width: '10px',
    });
  });
});

describe('Stepper', () => {
  test('renders a step per total and draws connectors between steps', () => {
    const { container } = render(
      <Stepper
        totalSteps={4}
        activeStep={2}
      />,
    );

    // Each step is a row holding the step marker and, except for the last one, a connector
    const steps = (container.firstChild as HTMLElement).children;
    expect(steps).toHaveLength(4);
    expect(steps[0].childElementCount).toBe(2);
    expect(steps[3].childElementCount).toBe(1);
  });
});
