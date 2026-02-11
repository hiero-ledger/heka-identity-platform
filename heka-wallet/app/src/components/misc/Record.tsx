import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { Field } from '@hyperledger/aries-oca/build/legacy'
import React from 'react'
import { FlatList, StyleSheet, View } from 'react-native'

import { RecordField } from './RecordField'

const useStyles = ({ Spacing }: HekaTheme) =>
  StyleSheet.create({
    container: {
      gap: Spacing.sm,
    },
    listHeader: {
      marginBottom: Spacing.md,
    },
  })

interface Props {
  header?: () => React.ReactElement | null
  footer?: () => React.ReactElement | null
  fields: Field[]
  hideFieldValues?: boolean
  field?: (field: Field, index: number, fields: Field[]) => React.ReactElement | null
  shown?: boolean[]
  toggleShownState?: (newShowStates: boolean[]) => void
  error?: boolean
}

export const Record: React.FC<Props> = ({
  header,
  footer,
  fields,
  hideFieldValues = false,
  field = null,
  shown = [],
  toggleShownState,
  error,
}) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)
  const { Spacing } = theme

  const onToggleShownField = (index: number) => {
    if (!hideFieldValues || !toggleShownState) return

    const newShowState = [...shown]
    newShowState[index] = !shown[index]
    toggleShownState(newShowState)
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      data={fields}
      keyExtractor={({ name }, index) => name || index.toString()}
      renderItem={({ item: attr, index }) =>
        field ? (
          field(attr, index, fields)
        ) : (
          <RecordField
            field={attr}
            hideFieldValue={hideFieldValues}
            onToggleViewPressed={() => onToggleShownField(index)}
            shown={hideFieldValues ? shown[index] : true}
            hideBottomBorder
            error={error}
          />
        )
      }
      ListHeaderComponent={
        header ? <View style={{ marginBottom: fields.length ? Spacing.md : 0 }}>{header()}</View> : null
      }
      ListFooterComponent={footer ? footer() : null}
    />
  )
}
