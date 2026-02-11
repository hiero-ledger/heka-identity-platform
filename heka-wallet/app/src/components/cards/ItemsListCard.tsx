import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import React, { ReactElement, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, FlatList, ListRenderItem, StyleSheet, Text, View, ViewStyle } from 'react-native'

import { SectionCard } from './SectionCard'

const LIST_EMPTY_ICON_PADDING = 96

const useStyles = ({ ColorPallet, Spacing, TextTheme }: HekaTheme) =>
  StyleSheet.create({
    listEmptyViewContainer: {
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100%',
      gap: Spacing.xl,
      padding: Spacing.md,
    },
    listEmptyText: {
      ...TextTheme.caption,
      color: ColorPallet.brand.label,
      textAlign: 'center',
    },
  })

interface Props<TItem> {
  title: string
  items: TItem[]
  renderItem: ListRenderItem<TItem>
  horizontal?: boolean
  containerStyle?: ViewStyle
  cardContentStyle?: ViewStyle
  itemsContainerStyle?: ViewStyle
  headerRightComponent?: ReactElement
  emptyListText?: string
  emptyListIcon?: ReactElement
  itemKeyExtractor?: (item: TItem, index: number) => string
  listFooterComponent?: ReactElement | null
  isLoading?: boolean
}

export const ItemsListCard = <TItem,>({
  title,
  items,
  renderItem,
  horizontal = true,
  containerStyle,
  itemsContainerStyle,
  cardContentStyle,
  headerRightComponent,
  emptyListText,
  emptyListIcon,
  itemKeyExtractor,
  listFooterComponent,
  isLoading,
}: Props<TItem>) => {
  const { t } = useTranslation()

  const flatListRef = useRef<FlatList>(null)

  const theme = useHekaTheme()
  const { ColorPallet } = theme

  useEffect(() => {
    if (items?.length) flatListRef?.current?.scrollToIndex({ index: 0, viewPosition: 0.5 })
  }, [items])

  const sectionCardContentStyle = horizontal ? { paddingHorizontal: 0, ...cardContentStyle } : { ...cardContentStyle }

  const hasItems = items.length !== 0
  const hasSeveralItems = items.length > 1
  return (
    <SectionCard
      title={title}
      containerStyle={containerStyle}
      contentViewStyle={sectionCardContentStyle}
      headerRightComponent={headerRightComponent}
    >
      {isLoading ? (
        <ActivityIndicator color={ColorPallet.brand.highlight} />
      ) : (
        <FlatList
          ref={flatListRef}
          horizontal={horizontal && hasItems}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          scrollEnabled={hasSeveralItems}
          decelerationRate="fast"
          contentContainerStyle={itemsContainerStyle}
          ListEmptyComponent={<ListEmptyView text={emptyListText ?? t('ItemsList.Empty')} icon={emptyListIcon} />}
          data={items}
          keyExtractor={itemKeyExtractor}
          renderItem={renderItem}
          ListFooterComponent={listFooterComponent}
        />
      )}
    </SectionCard>
  )
}

interface ListEmptyViewProps {
  text: string
  icon?: ReactElement
}

const ListEmptyView: React.FC<ListEmptyViewProps> = ({ text, icon }) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)

  return (
    <View style={{ ...styles.listEmptyViewContainer, paddingVertical: icon ? LIST_EMPTY_ICON_PADDING : undefined }}>
      {icon && <View>{icon}</View>}
      <Text style={styles.listEmptyText}>{text}</Text>
    </View>
  )
}
