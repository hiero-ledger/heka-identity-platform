import { Screens as BifoldScreens, ToastType } from '@hyperledger/aries-bifold-core'
import { QrCodeScanError } from '@hyperledger/aries-bifold-core/App/types/error'
import { ConnectStackParams } from '@hyperledger/aries-bifold-core/App/types/navigators'
import { PermissionContract } from '@hyperledger/aries-bifold-core/App/types/permissions'
import { useIsFocused } from '@react-navigation/native'
import { StackScreenProps } from '@react-navigation/stack'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { check, Permission, PERMISSIONS, Rationale, request, RESULTS } from 'react-native-permissions'
import Toast from 'react-native-toast-message'

import QRScanner from '../components/misc/QRScanner'
import CameraDisclosureModal from '../components/modals/CameraDisclosureModal'
import LoadingView from '../components/views/LoadingView'
import { useInvitationHandlers } from '../utils/useInvitationHandlers'

export type ScanProps = StackScreenProps<ConnectStackParams, BifoldScreens.Scan>

export const Scan: React.FC<ScanProps> = () => {
  const { t } = useTranslation()

  const { handleInvitationUrl } = useInvitationHandlers()

  const isScreenFocused = useIsFocused()

  const [loading, setLoading] = useState<boolean>(true)
  const [showDisclosureModal, setShowDisclosureModal] = useState<boolean>(true)
  const [qrCodeScanError, setQrCodeScanError] = useState<QrCodeScanError | null>(null)

  const handleCodeScan = async (value: string) => {
    setQrCodeScanError(null)
    try {
      await handleInvitationUrl(value)
    } catch (e: unknown) {
      const error = new QrCodeScanError(t('Scan.InvalidQrCode'), value, (e as Error)?.message)
      setQrCodeScanError(error)
    }
  }

  const permissionFlow = useCallback(
    async (method: PermissionContract, permission: Permission, rationale?: Rationale): Promise<boolean> => {
      try {
        const permissionResult = await method(permission, rationale)
        if (permissionResult === RESULTS.GRANTED) {
          setShowDisclosureModal(false)
          return true
        }
      } catch (error: unknown) {
        Toast.show({
          type: ToastType.Error,
          text1: t('Global.Failure'),
          text2: (error as Error)?.message || t('Error.Unknown'),
          visibilityTime: 2000,
        })
      }

      return false
    },
    [t]
  )

  const requestCameraUse = async (rationale?: Rationale): Promise<boolean> => {
    if (Platform.OS === 'android') {
      return await permissionFlow(request, PERMISSIONS.ANDROID.CAMERA, rationale)
    } else if (Platform.OS === 'ios') {
      return await permissionFlow(request, PERMISSIONS.IOS.CAMERA, rationale)
    }

    return false
  }

  useEffect(() => {
    const asyncEffect = async () => {
      if (Platform.OS === 'android') {
        await permissionFlow(check, PERMISSIONS.ANDROID.CAMERA)
      } else if (Platform.OS === 'ios') {
        await permissionFlow(check, PERMISSIONS.IOS.CAMERA)
      }
      setLoading(false)
    }

    asyncEffect()
  }, [permissionFlow])

  // 'isScreenFocused' is a workaround for visual issues related to navigation between stacks
  if (loading || !isScreenFocused) {
    return <LoadingView />
  }

  if (showDisclosureModal) {
    return <CameraDisclosureModal requestCameraUse={requestCameraUse} />
  }

  return <QRScanner handleCodeScan={handleCodeScan} error={qrCodeScanError} enableCameraOnError={true} />
}
