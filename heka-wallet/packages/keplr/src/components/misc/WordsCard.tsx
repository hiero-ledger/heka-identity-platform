import { HekaTheme, IconSizes, useHekaTheme, useGlobalStyles, IconButton } from '@heka-wallet/shared'
import Clipboard from '@react-native-clipboard/clipboard'
import { useIsFocused } from '@react-navigation/native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, StyleSheet, View } from 'react-native'

import { useSimpleTimer } from '../../utils/useSimpleTimer'

import { WordChip } from './WordChip'

const COPY_SUCCESS_ICON_TIMEOUT_MS = 3000
const HIDE_WORD_TIMEOUT_MS = 500

const useStyles = (theme: HekaTheme) =>
  StyleSheet.create({
    container: {
      marginVertical: theme.Spacing.md,
    },
    copyButtonContainer: {
      marginTop: theme.Spacing.md,
      paddingHorizontal: 0,
    },
  })

export interface Word {
  value: string
  empty?: boolean
  highlighted?: boolean
}

interface Props {
  wordSet: Word[]
  showCopyButton?: boolean
}

export const WordsCard: React.FC<Props> = ({ wordSet, showCopyButton }) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)
  const globalStyles = useGlobalStyles()

  const { t } = useTranslation()
  const { isTimedOut: showCopySuccess, setTimer: setCopySuccessTimer } = useSimpleTimer()

  /*
    On IOS, user can peek the words by right side gesture from the verifying mnemonic screen.
    To prevent this, hide the words if the screen lost the focus.
   */
  const [hideWord, setHideWord] = useState(false)
  const isFocused = useIsFocused()

  useEffect(() => {
    if (isFocused) {
      setHideWord(false)
    } else {
      const hideWordTimeout = setTimeout(() => {
        setHideWord(true)
      }, HIDE_WORD_TIMEOUT_MS)

      return () => clearTimeout(hideWordTimeout)
    }
  }, [isFocused])

  const copyToClipboard = () => {
    const wordsValue = wordSet.map((it) => it.value).join(' ')
    Clipboard.setString(wordsValue)
    setCopySuccessTimer(COPY_SUCCESS_ICON_TIMEOUT_MS)
  }

  return (
    <View style={styles.container}>
      <View style={globalStyles.multilineTextCard}>
        <FlatList
          data={wordSet}
          numColumns={3}
          scrollEnabled={false}
          contentContainerStyle={{ alignContent: 'center' }}
          ItemSeparatorComponent={() => <View style={{ height: theme.Spacing.md }} />}
          renderItem={({ item: word, index }) => {
            const indexToDisplay = index + 1
            const addLeftOffset = index % 3 !== 0

            return (
              <WordChip
                key={index}
                index={indexToDisplay}
                word={word.value}
                highlightBorder={word.highlighted}
                hideWord={hideWord}
                containerStyle={{
                  marginLeft: addLeftOffset ? theme.Spacing.xs : 0,
                }}
              />
            )
          }}
        />
      </View>
      {showCopyButton && (
        <IconButton
          iconName={showCopySuccess ? 'clipboard-check' : 'clipboard'}
          label={t('Common.CopyToClipboard')}
          onPress={copyToClipboard}
          iconSize={IconSizes.small}
          iconColor={theme.ColorPallet.grayscale.darkGrey}
          containerStyle={styles.copyButtonContainer}
          textStyle={theme.TextTheme.labelText}
        />
      )}
    </View>
  )
}
