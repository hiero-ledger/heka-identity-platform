import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import RecordBinaryField from '@hyperledger/aries-bifold-core/App/components/record/RecordBinaryField'
import RecordDateIntField from '@hyperledger/aries-bifold-core/App/components/record/RecordDateIntField'
import { hiddenFieldValue } from '@hyperledger/aries-bifold-core/App/constants'
import { isDataUrl } from '@hyperledger/aries-bifold-core/App/utils/helpers'
import { CaptureBaseAttributeType } from '@hyperledger/aries-oca'
import { Attribute, Field } from '@hyperledger/aries-oca/build/legacy'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import MaterialIcon from 'react-native-vector-icons/MaterialIcons'

const useStyles = ({ Spacing, BorderRadius, ListItems, BorderWidth }: HekaTheme) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: Spacing.md,
      borderRadius: BorderRadius.medium,
      paddingTop: Spacing.xs,
    },
    border: {
      ...ListItems.recordBorder,
      borderBottomWidth: BorderWidth.medium,
      paddingTop: Spacing.sm,
    },
    valueContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    errorLabel: {
      ...ListItems.recordAttributeText,
      alignSelf: 'center',
    },
  })

interface Props {
  field: Field
  hideFieldValue?: boolean
  hideBottomBorder?: boolean
  shown?: boolean
  onToggleViewPressed?: () => void
  fieldLabel?: (field: Field) => React.ReactElement | null
  fieldValue?: (field: Field) => React.ReactElement | null
  error?: boolean
}

const BINARY_ATTRIBUTE_ENCODING = 'base64'
const BINARY_ATTRIBUTE_FORMAT = new RegExp('^image/(jpeg|png|jpg)')

export const RecordField: React.FC<Props> = ({
  field,
  hideFieldValue = false,
  hideBottomBorder = false,
  shown = !hideFieldValue,
  onToggleViewPressed = () => undefined,
  fieldLabel = null,
  fieldValue = null,
  error,
}) => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)
  const { ColorPallet, TextTheme, IconSizes } = theme

  return (
    <View
      style={{
        ...styles.container,
        backgroundColor: error ? ColorPallet.semantic.errorTransparentLight : ColorPallet.brand.recordBackground,
      }}
    >
      <View style={styles.valueContainer}>
        <View>
          {fieldLabel ? (
            fieldLabel(field)
          ) : (
            <Text style={error ? styles.errorLabel : TextTheme.label}>{field.label ?? field.name}</Text>
          )}
          {fieldValue ? (
            fieldValue(field)
          ) : (
            <>
              <AttributeValue field={field as Attribute} shown={shown} />
            </>
          )}
        </View>
        {error && (
          <MaterialIcon
            style={{ alignSelf: 'center' }}
            name={'warning'}
            size={IconSizes.medium}
            color={ColorPallet.semantic.error}
          />
        )}
        {hideFieldValue ? (
          <TouchableOpacity
            accessible={true}
            accessibilityLabel={shown ? t('Record.Hide') : t('Record.Show')}
            activeOpacity={1}
            onPress={onToggleViewPressed}
            style={{ justifyContent: 'center' }}
          >
            <Text style={TextTheme.labelTitle}>{shown ? t('Record.Hide') : t('Record.Show')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {<View style={[styles.border, hideBottomBorder && { borderBottomWidth: 0 }]} />}
    </View>
  )
}

interface AttributeValueProps {
  field: Attribute
  shown?: boolean
  style?: Record<string, unknown>
}

const AttributeValue: React.FC<AttributeValueProps> = ({ field, style, shown }) => {
  const { ListItems } = useHekaTheme()

  if (
    (field.encoding == BINARY_ATTRIBUTE_ENCODING &&
      field.format &&
      BINARY_ATTRIBUTE_FORMAT.test(field.format) &&
      field.value) ||
    isDataUrl(field.value)
  ) {
    return <RecordBinaryField attributeValue={field.value as string} style={style} shown={shown} />
  }
  if (field.type == CaptureBaseAttributeType.DateInt || field.type == CaptureBaseAttributeType.DateTime) {
    return <RecordDateIntField field={field} style={style} shown={shown} />
  }
  return <Text style={style || ListItems.recordAttributeText}>{shown ? field.value : hiddenFieldValue}</Text>
}
