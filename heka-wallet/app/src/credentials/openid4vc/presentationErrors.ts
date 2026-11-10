import type { TFunction } from 'i18next'

type Oauth2ErrorFields = {
  error?: string
  errorDescription?: string
}

/**
 * The verifier answered the OpenID4VP authorization response with an error (non-2xx status).
 *
 * The message is meant for logs only: it names the HTTP status and the OAuth2 error code, never the
 * response body as a whole. Use `getPresentationErrorContent` to build what the user sees.
 */
export class PresentationRejectedError extends Error {
  public readonly status: number
  public readonly oauthError?: string
  public readonly oauthErrorDescription?: string

  public constructor({ status, body }: { status: number; body: unknown }) {
    const { error, errorDescription } = parseOauth2ErrorBody(body)
    super(`Verifier rejected the presentation (HTTP ${status}${error ? `, ${error}` : ''})`)
    this.name = 'PresentationRejectedError'
    this.status = status
    this.oauthError = error
    this.oauthErrorDescription = errorDescription

    Object.setPrototypeOf(this, PresentationRejectedError.prototype)
  }

  /** The verifier says it could not verify the presented credentials (Credo verifiers use `invalid_request`). */
  public get isVerificationFailure(): boolean {
    return (
      this.oauthError === 'invalid_request' ||
      (this.oauthErrorDescription !== undefined && /failed verification/i.test(this.oauthErrorDescription))
    )
  }
}

/**
 * Reads `error` and `error_description` from an OAuth2 error response body, which Credo returns either as
 * parsed JSON, as a raw string or as null.
 */
export function parseOauth2ErrorBody(body: unknown): Oauth2ErrorFields {
  let parsed = body
  if (typeof body === 'string') {
    try {
      parsed = JSON.parse(body)
    } catch {
      return {}
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {}
  }

  const { error, error_description: errorDescription } = parsed as Record<string, unknown>
  return {
    error: typeof error === 'string' ? error : undefined,
    errorDescription: typeof errorDescription === 'string' ? errorDescription : undefined,
  }
}

const MAX_DISPLAYED_MESSAGE_LENGTH = 300

/**
 * Returns the message if it is plain, short text. Messages that embed JSON (or are empty or too long)
 * are replaced by the fallback so raw payloads never reach the error modal.
 */
export function toDisplayableErrorMessage(message: unknown, fallback: string): string {
  if (typeof message !== 'string') return fallback

  const trimmed = message.trim()
  if (!trimmed || trimmed.length > MAX_DISPLAYED_MESSAGE_LENGTH || /[{}[\]]/.test(trimmed)) {
    return fallback
  }

  return trimmed
}

export type PresentationErrorContent = {
  title: string
  message: string
}

/**
 * Builds the title and message shown to the user when sharing an OpenID4VP presentation fails.
 */
export function getPresentationErrorContent(error: unknown, t: TFunction): PresentationErrorContent {
  if (error instanceof PresentationRejectedError) {
    if (error.isVerificationFailure) {
      return {
        title: t('ProofRequest.VerificationFailedTitle'),
        message: t('ProofRequest.VerificationFailedMessage'),
      }
    }

    return {
      title: t('ProofRequest.PresentationRejectedTitle'),
      message: t('ProofRequest.PresentationRejectedMessage'),
    }
  }

  return {
    title: t('Error.Title1027'),
    message: toDisplayableErrorMessage(error instanceof Error ? error.message : error, t('Error.Message1027')),
  }
}

/**
 * Error details that are safe to log: no response bodies beyond the OAuth2 error fields, no credentials.
 */
export function describePresentationError(error: unknown): Record<string, unknown> {
  if (error instanceof PresentationRejectedError) {
    return {
      name: error.name,
      status: error.status,
      oauthError: error.oauthError,
      oauthErrorDescription: error.oauthErrorDescription,
    }
  }

  if (error instanceof Error) {
    return { name: error.name, message: error.message }
  }

  return { error: String(error) }
}
