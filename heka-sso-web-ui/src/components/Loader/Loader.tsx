import LinearSpinner from '@/assets/icons/linear-spinner.svg?react'
import Spinner from '@/assets/icons/spinner.svg?react'

export type LoaderType = 'circular' | 'linear'

interface LoaderProps {
  type?: LoaderType
  /** Square size in px; defaults to identity-service's 260 / 240. */
  size?: number
  label?: string
}

// Pixels of heka-identity-service-web-ui `shared/ui/Loader` (same SVGs).
function Loader({ type = 'circular', size, label }: LoaderProps) {
  const Icon = type === 'linear' ? LinearSpinner : Spinner
  const px = size ?? (type === 'linear' ? 240 : 260)
  return <Icon width={px} height={px} role="img" aria-label={label ?? 'Loading'} />
}

export default Loader
