export {
  detectWebWallet,
  onExtensionReady,
  onNextResponse,
  onPresentStatus,
  onReceiveStatus,
  sendOffer,
  sendPresentationRequest,
} from './bridge';
export { isCredentialOfferUri, isPresentationRequestUri } from './protocol';
export type {
  WebWalletInfo,
  WebWalletResponse,
  WebWalletStatus,
} from './protocol';
