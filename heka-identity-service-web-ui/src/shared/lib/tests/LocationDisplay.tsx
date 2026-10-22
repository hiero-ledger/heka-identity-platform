import { useLocation } from 'react-router-dom';

/** Renders the current location so tests can assert on navigation and its state. */
export const LocationDisplay = () => {
  const location = useLocation();
  return (
    <>
      <div data-testid="location">{location.pathname}</div>
      <pre data-testid="location-state">
        {JSON.stringify(location.state ?? null)}
      </pre>
    </>
  );
};

/** Parses what `LocationDisplay` rendered as `location-state`. */
export const readLocationState = (element: HTMLElement) =>
  JSON.parse(element.textContent ?? 'null');
