import { ValidateBy, ValidationOptions, ValidationArguments, buildMessage } from 'class-validator'
import { ZodType } from 'zod'

const IS_ZOD_TYPE = 'isZodType'

function isValidZodType(value: unknown, zodType: ZodType, validationArguments?: ValidationArguments): boolean {
  const parseResult = zodType.safeParse(value)

  if (!parseResult.success) {
    validationArguments!.constraints[1] = parseResult.error.issues
      .map((e) => `${e.path.join(' - ').trim() !== '' ? `${e.path.join(' - ')}: ` : ''}${e.message}`)
      .join(', ')
  }

  return parseResult.success
}

export function IsZodType(zodType: ZodType, validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: IS_ZOD_TYPE,
      constraints: [zodType],
      validator: {
        validate: (value, args): boolean => isValidZodType(value, args?.constraints[0], args),
        defaultMessage: buildMessage((eachPrefix) => eachPrefix + '$constraint2', validationOptions),
      },
    },
    validationOptions,
  )
}
