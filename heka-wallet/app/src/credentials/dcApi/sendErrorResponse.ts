import { sendErrorResponse } from '@animo-id/expo-digital-credentials-api'

/**
 * Returns an error to the OS / calling browser for the current Digital Credentials API request.
 */
export function dcApiSendErrorResponse(errorMessage: string): void {
  sendErrorResponse({ errorMessage })
}
