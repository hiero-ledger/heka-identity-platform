import {
  Button as AriaButton,
  ButtonProps as AriaButtonProps,
} from 'react-aria-components'

import styles from './Button.module.scss'

interface ButtonProps extends AriaButtonProps {
  buttonType?: 'filled' | 'outlined'
}

// Minimal platform-styled button: react-aria-components
// with the pixels of heka-identity-service-web-ui's Button — only the variants
// this app needs, none of the icon/loader machinery.
function Button({ buttonType = 'filled', className, ...props }: ButtonProps) {
  const classes = [styles.Button, styles[buttonType], className]
    .filter(Boolean)
    .join(' ')
  return <AriaButton className={classes} {...props} />
}

export default Button
