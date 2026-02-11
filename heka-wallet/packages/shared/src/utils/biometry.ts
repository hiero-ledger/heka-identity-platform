import FingerprintScanner from 'react-native-fingerprint-scanner'

const USER_CANCEL_ERROR_NAMES = ['UserCancel', 'UserFallback']

export function authenticateByBiometry(title: string): Promise<void> {
  return FingerprintScanner.authenticate({ title }).finally(() => {
    FingerprintScanner.release()
  })
}

export function isBiometryCancelledError(errorName: string) {
  return USER_CANCEL_ERROR_NAMES.includes(errorName)
}
