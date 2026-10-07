import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import '@/translations';

import { LogoImageField } from './LogoImageField';

describe('LogoImageField', () => {
  const originalCreateObjectURL = URL.createObjectURL;

  beforeEach(() => {
    URL.createObjectURL = jest.fn(() => 'blob:logo');
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
  });

  const fileInput = () =>
    document.querySelector('input[type="file"]') as HTMLInputElement;

  test('shows an image path and reports a selected file', async () => {
    const user = userEvent.setup();
    const selectFile = jest.fn();

    render(
      <LogoImageField
        altI18nKey="Common.imageAlts.issuerLogo"
        file="/logo.png"
        selectFile={selectFile}
      />,
    );

    expect(screen.getByRole('img', { name: 'Issuer logo' })).toHaveAttribute(
      'src',
      '/logo.png',
    );
    expect(fileInput()).toHaveAttribute('accept', 'image/png,image/jpeg');

    const file = new File(['png'], 'new-logo.png', { type: 'image/png' });
    await user.upload(fileInput(), file);

    expect(selectFile).toHaveBeenCalledWith(file);
  });

  test('previews a file object', () => {
    const file = new File(['png'], 'logo.png', { type: 'image/png' });

    render(
      <LogoImageField
        altI18nKey="Common.imageAlts.schemaLogo"
        file={file}
        selectFile={jest.fn()}
        isLoading={false}
      />,
    );

    expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    expect(screen.getByRole('img', { name: 'Schema logo' })).toHaveAttribute(
      'src',
      'blob:logo',
    );
  });

  test('keeps the current file when the selection is empty', () => {
    const selectFile = jest.fn();

    render(
      <LogoImageField
        altI18nKey="Common.imageAlts.issuerLogo"
        file="/logo.png"
        selectFile={selectFile}
      />,
    );

    fireEvent.change(fileInput(), { target: { files: [] } });

    expect(selectFile).toHaveBeenCalledWith('/logo.png');
  });
});
