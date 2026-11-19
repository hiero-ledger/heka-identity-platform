import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator'

import { ProtocolType } from '../../common/types'

interface DynamicObjectValidationOptions {
  allowedTypes: ('boolean' | 'number' | 'string' | 'object')[]
  allowNestedObjects?: boolean
  maxDepth?: number
}

@ValidatorConstraint({ name: 'IsValidDynamicObject', async: false })
class IsValidDynamicObjectConstraint implements ValidatorConstraintInterface {
  private options: DynamicObjectValidationOptions

  public constructor(options?: DynamicObjectValidationOptions) {
    this.options = {
      allowedTypes: ['boolean', 'number', 'string', 'object'],
      allowNestedObjects: true,
      maxDepth: 5,
      ...options,
    }
  }

  public validate(value: any, args: ValidationArguments): boolean {
    return this.isValidDynamicObject(value, 0)
  }

  private isValidDynamicObject(value: any, depth: number): boolean {
    if (typeof value !== 'object' || value === null) {
      return false
    }

    if (this.options.maxDepth !== undefined && depth > this.options.maxDepth) {
      return false
    }

    for (const key in value) {
      const val = value[key]
      const valType = typeof val

      if (!this.options.allowedTypes.includes(valType as any)) {
        return false
      }

      if (valType === 'object' && val !== null) {
        if (!this.options.allowNestedObjects) {
          return false
        }
        if (!this.isValidDynamicObject(val, depth + 1)) {
          return false
        }
      }
    }

    return true
  }
}

export function IsValidDynamicObject(
  dynamicOptions?: DynamicObjectValidationOptions,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'IsValidDynamicObject',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: new IsValidDynamicObjectConstraint(dynamicOptions),
    })
  }
}

export const compatibleForProtocol = (
  protocol: ProtocolType,
  value: any,
  enabledValues: Record<ProtocolType, Array<string>>,
) => (enabledValues[protocol]?.indexOf(value) ?? -1) >= 0

export function IsCorrectForProtocol(
  protocolPropertyName: string,
  enabledItems: Record<ProtocolType, Array<string>>,
  validationOptions?: ValidationOptions,
) {
  return function (object: any, propertyName: string) {
    registerDecorator({
      name: 'IsCorrectForProtocol',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [protocolPropertyName],
      options: validationOptions,
      validator: {
        validate(value: string, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints
          const relatedValue = (args.object as any)[relatedPropertyName]
          return compatibleForProtocol(relatedValue as ProtocolType, value, enabledItems)
        },
      },
    })
  }
}
