import { applyDecorators, Type } from '@nestjs/common'
import { ApiExtraModels, ApiOkResponse as NestApiOkResponse, getSchemaPath } from '@nestjs/swagger'

import { ListResponse } from '../list-response'

export const ApiListResponse = <T extends Type<any>>(options: { listItemType: T; description?: string | undefined }) =>
  applyDecorators(
    ApiExtraModels(ListResponse, options.listItemType),
    NestApiOkResponse({
      description: options.description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(ListResponse) },
          {
            properties: {
              items: {
                type: 'array',
                items: {
                  $ref: getSchemaPath(options.listItemType),
                },
              },
            },
          },
        ],
      },
    }),
  )
