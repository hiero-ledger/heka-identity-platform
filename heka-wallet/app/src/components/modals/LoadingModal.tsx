import React from 'react'
import { Modal } from 'react-native'

import LoadingView from '../views/LoadingView'

export const LoadingModal: React.FC = () => {
  return (
    <Modal visible transparent>
      <LoadingView />
    </Modal>
  )
}
