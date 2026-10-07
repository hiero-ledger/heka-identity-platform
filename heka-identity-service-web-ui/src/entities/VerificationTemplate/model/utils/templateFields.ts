import { Schema } from '@/entities/Schema/model/types/schema';

export interface TemplateField {
  schemaFieldId: string;
}

/**
 * Maps the requested attribute names to the schema's field ids. Throws when an attribute is
 * not a field of the schema, so a template never references a field that does not exist.
 */
export const toTemplateFields = (
  schema: Schema,
  attributes: string[],
): TemplateField[] =>
  attributes.map((attribute) => {
    const field = schema.fields?.find((field) => field.name === attribute);
    if (!field) {
      throw new Error(
        `Attribute "${attribute}" is not a field of schema "${schema.name}"`,
      );
    }
    return { schemaFieldId: field.id };
  });
