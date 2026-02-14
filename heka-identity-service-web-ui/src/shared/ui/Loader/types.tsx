export interface LoaderProps {
  type?: LoaderType;
  size?: number;
}

export enum LoaderType {
  Circular = 'circular',
  Linear = 'linear',
}
