import { describe, expect, it } from 'vitest'

import { normalizeMdocNamespaces } from '../mdoc-namespaces'

describe('normalizeMdocNamespaces', () => {
  it('converts string age_over_NN values to booleans', () => {
    expect(
      normalizeMdocNamespaces({
        'org.iso.18013.5.1': { age_over_18: 'true', age_over_21: 'False', age_over_65: ' true ' },
      }),
    ).toEqual({
      'org.iso.18013.5.1': { age_over_18: true, age_over_21: false, age_over_65: true },
    })
  })

  it('keeps boolean age_over_NN values and other elements untouched', () => {
    const namespaces = {
      'org.iso.18013.5.1': {
        age_over_18: false,
        given_name: 'John',
        birth_date: '1990-01-15',
        document_number: 'true',
      },
      mDL: { age_over_18: true },
    }
    expect(normalizeMdocNamespaces(namespaces)).toEqual(namespaces)
  })

  it('leaves values that are not recognised booleans unchanged', () => {
    expect(normalizeMdocNamespaces({ ns: { age_over_18: 'yes', age_over_21: 1 } })).toEqual({
      ns: { age_over_18: 'yes', age_over_21: 1 },
    })
  })
})
