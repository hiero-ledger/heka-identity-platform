import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Delimiter } from '@/components/Delimiter';
import { NoItemFound } from '@/components/NoItemFound/NoItemFound';
import { PlusButton } from '@/components/PlusButton';
import { QRCode } from '@/components/QRCode';
import { StepHeader, StepTitle } from '@/components/StepTitle';

import { Logo } from './Logo';

describe('Logo', () => {
  test('is a labelled button that calls onClick', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();

    render(
      <Logo
        label="Home"
        onClick={onClick}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Home' }));
    expect(onClick).toHaveBeenCalled();
  });
});

describe('PlusButton', () => {
  test('is a labelled button that calls onPress', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();

    render(
      <PlusButton
        title="Add schema"
        onPress={onPress}
      />,
    );

    expect(screen.getByTitle('Add schema')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add schema' }));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('NoItemFound', () => {
  test('renders title only', () => {
    render(<NoItemFound title="Nothing here" />);

    expect(
      screen.getByRole('heading', { name: 'Nothing here' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('renders description and an action button', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();

    render(
      <NoItemFound
        title="No templates"
        description="Create your first template"
        buttonTitle="Create"
        onClick={onClick}
      />,
    );

    expect(screen.getByText('Create your first template')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(onClick).toHaveBeenCalled();
  });
});

describe('QRCode', () => {
  test('renders the content as an SVG QR code', () => {
    const { container } = render(<QRCode content="didcomm://invite" />);

    expect(container.querySelector('svg')).toHaveAttribute('width', '280');
  });

  test('uses the given size', () => {
    const { container } = render(
      <QRCode
        content="didcomm://invite"
        size={120}
      />,
    );

    expect(container.querySelector('svg')).toHaveAttribute('width', '120');
  });
});

describe('StepTitle', () => {
  test('renders a title', () => {
    render(<StepTitle title="Choose schema" />);

    expect(screen.getByText('Choose schema')).toBeInTheDocument();
  });

  test('StepHeader renders title and details', () => {
    render(
      <StepHeader
        title="Connect"
        details={['Scan the QR code', 'Accept the offer']}
      />,
    );

    expect(screen.getByText('Connect')).toBeInTheDocument();
    expect(screen.getByText('Scan the QR code')).toBeInTheDocument();
    expect(screen.getByText('Accept the offer')).toBeInTheDocument();
  });

  test('StepHeader renders without details', () => {
    const { container } = render(<StepHeader title="Connect" />);

    expect((container.firstChild as HTMLElement).childElementCount).toBe(1);
  });
});

describe('Delimiter', () => {
  test('renders an empty row', () => {
    const { container } = render(<Delimiter />);

    expect(container.firstChild).toBeEmptyDOMElement();
  });
});
