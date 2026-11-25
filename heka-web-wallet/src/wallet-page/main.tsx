import 'reflect-metadata'

import { createRoot } from 'react-dom/client'

import { WalletPage } from './WalletPage'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Wallet page root is missing')
}

createRoot(root).render(<WalletPage />)
