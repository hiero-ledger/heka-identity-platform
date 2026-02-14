import { Schema } from '@/entities/Schema/model/types/schema';

export const formatSchemaAttributes = (schema: Schema) => {
  const { fields, ...rest } = schema;
  const updatedFields =
    fields?.map((field: { id: string; name: string }) => field.name) ?? [];

  return { ...rest, attributes: updatedFields };
};
