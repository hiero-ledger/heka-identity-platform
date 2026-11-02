/** Stand-ins for the QR code and the react-aria Select, which are awkward to drive in jsdom. */
export const QRCodeStub = ({ content }: { content: string }) => (
  <div data-testid="qr">{content}</div>
);

export const SelectStub = ({
  items,
  placeholder,
  onSelect,
}: {
  items: Array<{ value: string; content: string }>;
  placeholder?: string;
  onSelect: (value: string) => void;
}) => (
  <select
    aria-label={placeholder}
    defaultValue=""
    onChange={(e) => onSelect(e.target.value)}
  >
    <option value="">{placeholder}</option>
    {items.map((item) => (
      <option
        key={item.value}
        value={item.value}
      >
        {item.content}
      </option>
    ))}
  </select>
);
