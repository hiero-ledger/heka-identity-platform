export interface SchemaItem {
  isHidden?: boolean;
  id: string;
  logo?: string;
  name?: string;
  registrationsCount?: number;
  bgColor?: string;
}

export interface SchemaProps {
  schema: SchemaItem;
  onVisibilityChanged: (schema: SchemaItem) => void;
  onChange: (id: string) => void;
  onRegistrationsClick: (id: string) => void;
}
