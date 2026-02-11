import { HekaTheme, useHekaTheme, useGlobalStyles, ScreenInfoText, randomSort } from '@heka-wallet/shared'
import { Button, ButtonType } from '@hyperledger/aries-bifold-core'
import ButtonLoading from '@hyperledger/aries-bifold-core/App/components/animated/ButtonLoading'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp, StackScreenProps } from '@react-navigation/stack'
import { observer } from 'mobx-react-lite'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, StyleSheet, View } from 'react-native'

import { Word, WordChip } from '../../../components/misc'
import { RegisterStackParams, Screens } from '../../../navigators/types'

const CANDIDATE_WORDS_COUNT = 4

const useStyles = (theme: HekaTheme) =>
  StyleSheet.create({
    candidateWordsContainer: {
      justifyContent: 'space-evenly',
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    candidateWordChip: {
      minWidth: 60,
      marginRight: 0,
      marginBottom: 0,
      paddingHorizontal: theme.Spacing.xs,
    },
    continueButton: {
      flex: 1,
      justifyContent: 'flex-end',
      paddingBottom: theme.Spacing.md,
    },
  })

interface CandidateWord {
  word: string
  usedIndex: number
}

type VerifyMnemonicScreenProps = StackScreenProps<RegisterStackParams, Screens.VerifyMnemonic>

export const VerifyMnemonicScreen: React.FC<VerifyMnemonicScreenProps> = observer(({ route }) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)
  const globalStyles = useGlobalStyles()

  const { t } = useTranslation()
  const navigation = useNavigation<StackNavigationProp<RegisterStackParams>>()

  const registerConfig = route.params.registerConfig
  const newMnemonicConfig = route.params.newMnemonicConfig

  const [candidateWords, setCandidateWords] = useState<CandidateWord[]>([])
  const [wordSet, setWordSet] = useState<(string | undefined)[]>([])

  useEffect(() => {
    const words = newMnemonicConfig.mnemonic.split(' ')
    const randomSortedWords = randomSort(words.slice())

    const candidateWords = randomSortedWords.slice(0, CANDIDATE_WORDS_COUNT)
    setCandidateWords(
      candidateWords.map((word) => {
        return {
          word,
          usedIndex: -1,
        }
      })
    )

    const candidateWordsCopy = candidateWords.slice()
    setWordSet(
      newMnemonicConfig.mnemonic.split(' ').map((word) => {
        const wordIndex = candidateWordsCopy.indexOf(word)
        if (wordIndex >= 0) {
          candidateWordsCopy.splice(wordIndex, 1)
          return
        }
        return word
      })
    )
  }, [newMnemonicConfig.mnemonic])

  const firstEmptyWordSetIndex = wordSet.findIndex((word) => word === undefined)

  const [isCreating, setIsCreating] = useState(false)

  const onWordButtonPress = (word: string, usedIndex: number, index: number) => {
    const newWordSet = wordSet.slice()
    const newCandidateWords = candidateWords.slice()
    if (usedIndex < 0) {
      if (firstEmptyWordSetIndex < 0) return

      newWordSet[firstEmptyWordSetIndex] = word
      setWordSet(newWordSet)

      newCandidateWords[index].usedIndex = firstEmptyWordSetIndex
      setCandidateWords(newCandidateWords)
    } else {
      newWordSet[usedIndex] = undefined
      setWordSet(newWordSet)

      newCandidateWords[index].usedIndex = -1
      setCandidateWords(newCandidateWords)
    }
  }

  const onSubmit = async () => {
    setIsCreating(true)
    await registerConfig.createMnemonic(
      newMnemonicConfig.name,
      newMnemonicConfig.mnemonic,
      newMnemonicConfig.password,
      route.params.bip44HDPath
    )
    navigation.reset({
      index: 0,
      routes: [
        {
          name: Screens.RegisterEnd,
          params: {
            password: newMnemonicConfig.password,
          },
        },
      ],
    })
  }

  const isMnemonicValid = wordSet.join(' ') === newMnemonicConfig.mnemonic

  return (
    <View style={globalStyles.defaultContainer}>
      <ScreenInfoText
        title={t('Crypto.Register.VerifyMnemonic.Title')}
        textLines={[t('Crypto.Register.VerifyMnemonic.InfoText')]}
      />
      <CandidateWords words={candidateWords} onWordButtonPress={onWordButtonPress} />
      <VerificationWordsCard
        wordSet={wordSet.map((word, index) => ({
          value: word ?? '',
          empty: word === undefined,
          highlighted: index === firstEmptyWordSetIndex,
        }))}
        candidateWords={candidateWords}
      />
      <View style={styles.continueButton}>
        <Button
          title={t('Global.Continue')}
          buttonType={ButtonType.Primary}
          disabled={!isMnemonicValid || isCreating}
          onPress={onSubmit}
        >
          {isCreating && <ButtonLoading />}
        </Button>
      </View>
    </View>
  )
})

interface CandidateWordsProps {
  words: CandidateWord[]
  onWordButtonPress: (word: string, mnemonicIndex: number, index: number) => void
}

const CandidateWords: React.FC<CandidateWordsProps> = ({ words, onWordButtonPress }) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)

  return (
    <View style={styles.candidateWordsContainer}>
      {words.map(({ word, usedIndex }, index) => {
        return (
          <View key={index} style={{ padding: theme.Spacing.xxxs }}>
            <WordChip
              key={index}
              word={word}
              onPress={() => onWordButtonPress(word, usedIndex, index)}
              highlightContent={usedIndex >= 0}
              containerStyle={styles.candidateWordChip}
            />
          </View>
        )
      })}
    </View>
  )
}

interface VerificationWordsCardProps {
  wordSet: Word[]
  candidateWords: CandidateWord[]
  hideWords?: boolean
}

const ITEM_OFFSET = 70

const INDEXES_WITH_LEFT_OFFSET = [2, 6, 10]
const INDEXES_WITHOUT_RIGHT_OFFSET = [3, 7, 11]

const VerificationWordsCard: React.FC<VerificationWordsCardProps> = ({ wordSet, candidateWords, hideWords }) => {
  const theme = useHekaTheme()
  return (
    <FlatList
      style={{ marginTop: theme.Spacing.xxl * 2 }}
      data={wordSet}
      numColumns={2}
      scrollEnabled={false}
      ItemSeparatorComponent={() => <View style={{ height: theme.Spacing.md }} />}
      renderItem={({ item: word, index }) => {
        const indexToDisplay = index + 1
        const isFilledCandidateWord = !!candidateWords.find((it) => it.word === word.value)

        const addLeftOffset = INDEXES_WITH_LEFT_OFFSET.includes(index)
        const addRightOffset = !INDEXES_WITHOUT_RIGHT_OFFSET.includes(index)

        return (
          <WordChip
            key={index}
            index={indexToDisplay}
            word={word.value}
            highlightBorder={word.highlighted}
            highlightContent={isFilledCandidateWord}
            hideWord={hideWords}
            containerStyle={{
              marginLeft: addLeftOffset ? ITEM_OFFSET : 0,
              marginRight: addRightOffset ? ITEM_OFFSET : 0,
            }}
          />
        )
      }}
    />
  )
}
