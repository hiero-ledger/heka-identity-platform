import { validate } from 'class-validator'

import { IsValidDynamicObject } from 'utils/validation'

class DynamicKeysObject {
  [key: string]: unknown
}

class DynamicKeysObjectDto {
  @IsValidDynamicObject({
    allowedTypes: ['boolean', 'object'],
    allowNestedObjects: true,
  })
  public dynamicKeysObject!: DynamicKeysObject
}

describe('IsValidDynamicObject Validation', () => {
  test('Valid DynamicKeysObject with booleans', async () => {
    const dto = new DynamicKeysObjectDto()
    dto.dynamicKeysObject = {
      key1: true,
      key2: false,
    }

    const errors = await validate(dto)
    expect(errors.length).toBe(0)
  })

  test('Valid DynamicKeysObject with nested DynamicKeysObjects', async () => {
    const dto = new DynamicKeysObjectDto()
    dto.dynamicKeysObject = {
      section1: {
        subKey1: true,
        subKey2: false,
      },
      section2: {
        subSection1: {
          subSubKey1: true,
        },
      },
    }

    const errors = await validate(dto)
    expect(errors.length).toBe(0)
  })

  test('Valid DynamicKeysObject with maxDepth', async () => {
    class DynamicKeysObjectDtoWithMaxDepth {
      @IsValidDynamicObject({
        allowedTypes: ['boolean', 'object'],
        maxDepth: 2,
      })
      public dynamicKeysObject!: DynamicKeysObject
    }

    const dto = new DynamicKeysObjectDtoWithMaxDepth()
    dto.dynamicKeysObject = {
      level1: {
        level2: {
          key: true,
        },
      },
    }

    const errors = await validate(dto)
    expect(errors.length).toBe(0)
  })

  test('Invalid DynamicKeysObject with string value', async () => {
    const dto = new DynamicKeysObjectDto()
    dto.dynamicKeysObject = {
      key1: 'invalid',
    } as any

    const errors = await validate(dto)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].constraints?.IsValidDynamicObject).toBeDefined()
  })

  test('Invalid DynamicKeysObject with number value', async () => {
    const dto = new DynamicKeysObjectDto()
    dto.dynamicKeysObject = {
      key1: 123,
    } as any

    const errors = await validate(dto)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].constraints?.IsValidDynamicObject).toBeDefined()
  })

  test('Invalid DynamicKeysObject with null value', async () => {
    const dto = new DynamicKeysObjectDto()
    dto.dynamicKeysObject = null as any

    const errors = await validate(dto)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].constraints?.IsValidDynamicObject).toBeDefined()
  })

  test('Invalid DynamicKeysObject with undefined value', async () => {
    const dto = new DynamicKeysObjectDto()
    dto.dynamicKeysObject = undefined as any

    const errors = await validate(dto)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].constraints?.IsValidDynamicObject).toBeDefined()
  })

  test('Invalid DynamicKeysObject exceeding maxDepth', async () => {
    class DynamicKeysObjectDtoWithMaxDepth {
      @IsValidDynamicObject({
        allowedTypes: ['boolean', 'object'],
        maxDepth: 2,
      })
      public dynamicKeysObject!: DynamicKeysObject
    }

    const dto = new DynamicKeysObjectDtoWithMaxDepth()
    dto.dynamicKeysObject = {
      level1: {
        level2: {
          level3: {
            key: true,
          },
        },
      },
    }

    const errors = await validate(dto)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].constraints?.IsValidDynamicObject).toBeDefined()
  })

  test('Invalid DynamicKeysObject when nested objects are not allowed', async () => {
    class DynamicObjectDtoNoNested {
      @IsValidDynamicObject({
        allowedTypes: ['boolean'],
        allowNestedObjects: false,
      })
      public dynamicKeysObject!: DynamicKeysObject
    }

    const dto = new DynamicObjectDtoNoNested()
    dto.dynamicKeysObject = {
      key1: true,
      key2: {
        subKey1: false,
      } as any,
    }

    const errors = await validate(dto)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].constraints?.IsValidDynamicObject).toBeDefined()
  })

  test('Valid DynamicKeysObject when nested objects are not allowed and no nested objects present', async () => {
    class DynamicKeysObjectDtoNoNested {
      @IsValidDynamicObject({
        allowedTypes: ['boolean'],
        allowNestedObjects: false,
      })
      public dynamicKeysObject!: DynamicKeysObject
    }

    const dto = new DynamicKeysObjectDtoNoNested()
    dto.dynamicKeysObject = {
      key1: true,
      key2: false,
    }

    const errors = await validate(dto)
    expect(errors.length).toBe(0)
  })
})
