// prettier-ignore
const translation = {
  "Common": {
    "Next": "Next",
    "Confirm": "Confirm",
    "Advanced": "Advanced",
    "CopyToClipboard": "Copy to clipboard",
    "Available": "Available",
    "Send": "Send",
    "Low": "Low",
    "Average": "Average",
    "High": "High",
    "Security": "Security",
    "NotSpecified": "Not specified",
    "Scan": "Scan",
    "Code": "Code",
    "CreateNew": "Create new",
    "UseExisting": "Use Existing"
  },
  "Auth": {
    "Login": "Login"
  },
  "Home": {
    "Credentials": "Credentials",
    "Notifications": "Notifications",
    "Chats": "Chats",
    "CredentialsGuide": "Scan a special QR code to receive and use credentials",
    "NotificationsEmpty": "You don't have notifications",
    "ChatsEmpty": "You don't have chats",
    "AllCredentials": "All credentials"
  },
  "ContactDetails": {
    "RemoveContact": "Remove contact",
    "GoToCredentials": "Go to credentials"
  },
  "CredentialDetails" : {
    "ShowAll": "Show all fields",
    "HideAll": "Hide all fields",
    "Remove": "Remove",
  },
  "TabStack": {
    "Coins": "Coins",
    "Settings": "Settings"
  },
  "Passkeys": {
    "PasskeyAuth": "Passkey authentication",
    "SelectAuthOption": "Please select passkey authentication option",
    "AuthenticateWithExisting": "Authenticate with existing passkey",
    "CreateNew": "Create new passkey"
  },
  "WalletBackup" : {
    "WalletRestore": "Wallet restore",
    "BackupIsAvailable": "Backup is available",
    "BackupIsNotAvailable": "Backup is not available",
    "BackupWallet": "Backup wallet",
    "BackupingWallet": "Backuping...",
    "RestoreWallet": "Restore wallet",
    "UsePasskeyToAuth": "Please use passkey to authenticate with backup service"
  },
  "Crypto": {
    "Title": "Keplr Wallet",
    "Balance": "Balance",
    "Token": "Token",
    "Staked": "Staked",
    "ConfirmTransaction": "Confirm transaction",
    "MnemonicSeed": "Mnemonic seed",
    "HardwareWallet": "Hardware wallet",
    "PrivateKey": "Private key",
    "Register" : {
      "NewWallet": "Create new wallet",
      "ImportExisting": "Import existing wallet",
      "ImportLedgerNano": "Import Ledger Nano X",
      "CompletedTitle": "You’re all set!",
      "CompletedText": "Your cosmic interchain journey now begins",
      "MnemonicBackupRecommendation": "Backup your mnemonic seed securely",
      "NewMnemonic": {
        "Title": "Back up your wallet",
        "InfoText1": "Your secret mnemonic phrase is used to recover your crypto if you lose your phone or switch to a different wallet.",
        "InfoText2": "Save these 12 words in a secure location, such as a password manager, and never share them with anyone."
      },
      "VerifyMnemonic": {
        "Title": "You saved it, right?",
        "InfoText": "Verify that you saved your secret mnemonic phrase by tapping the words in order:"
      },
      "ImportWallet": {
        "Title": "Import your wallet",
        "InfoText": "Import your wallet with the 12-word mnemonic phrase that you have backed up."
      },
      "Form" : {
        "WalletLabel": {
          "Label": "Wallet label",
           "Required": "Name is required"
        },
        "Password": {
          "Label": "Password",
          "Required": "Password is required",
          "Invalid": "Invalid password",
          "TooShort": "Password must be longer than 8 characters",
        },
        "ConfirmPassword": {
          "Label": "Confirm password",
          "Required": "Confirm password is required",
          "TooShort": "Password must be longer than 8 characters",
          "DoesntMatch": "Password doesn't match"
        },
        "Mnemonic": {
          "Label": "Mnemonic seed",
          "Required": "Mnemonic is required",
          "TooShort": "Mnemonic must contain at least 8 words",
          "Invalid": "Invalid mnemonic",
          "InvalidPrivateKey": "Invalid private key",
          "InvalidPrivateKeyLength" : "Invalid length of private key"
        }
      },
      "BIP44": {
        "HDDerivationPath": "HD Derivation path",
        "Description": "Set custom address derivation path by modifying the indexes below:",
        "InvalidChange": "Change should be 0 or 1"
      }
    },
    "Home": {
      "TotalBalance": "Total Balance",
      "BIP44": {
        "SelectAccount": "Select Account",
        "PreviousTxs": "Previous txs"
      },
      "Tokens" : {
        "ViewAll": "View all tokens",
      }
    },
    "Account": {
      "KeplrAccount": "Keplr Account",
      "NoAccount": "No account",
      "SelectAccount": "Select Account",
      "Selected": "{{name}} (Selected)",
      "RemoveAccount": "Remove account {{name}}"
    },
    "Send": {
      "Recipient": "Recipient",
      "Amount": "Amount",
      "Memo": "Memo (Optional)",
      "Fee": "Fee",
      "Gas": "Gas"
    },
    "Unlock": {
      "SignIn": "Sign in",
      "UseBiometry": "Use Biometric Authentication"
    },
    "Error": {
      "Unknown": "Unknown Error",
      "ErrorCode": "Error code",
      "InvalidBech32Error": "Invalid address",
      "ICNSFailedToFetchError": "Failed to fetch the address from ICNS",
      "InvalidNumberAmountError": "Invalid number",
      "ZeroAmountError": "Amount is zero",
      "NegativeAmountError": "Amount is negative",
      "InsufficientAmountError": "Insufficient funds",
      "InsufficientFeeError": "Insufficient available balance for transaction fee"
    }
  },
  "Biometry": {
    "Biometrics": "Biometrics",
    "Enable": "Enable Biometrics",
    "Toggle": "Toggle Biometrics",
    "EnabledText1": "Log in with your phone's biometrics instead of your wallet PIN. This means all fingerprint and facial data added on this phone can be used to access your Heka Wallet App.",
    "EnabledText2": "Ensure only you have access to your Heka Wallet App.",
    "Warning": "Ensure only you have access to your Heka Wallet App.",
    "UseToUnlock": "Use biometrics to unlock the app",
    "Skip": "Skip",
    "EnabledTitle": "Biometrics use",
    "EnabledDescription": "You need to set up biometrics in the device settings first and then you will be able to enable it for accessing Heka Wallet App.",
    "OpenSettings": "Open settings"
  },
  "Connection": {
    "MakingConnection": "Make a secure connection.",
    "UnknownConnection": "Unknown Connection"
  },
  "ConnectionDetails": {
    "Rename": "Rename",
    "Delete": "Delete",
  },
  "Contacts": {
    "TypeHere": "Message"
  },
  "Credentials": {
    "Credential": "Credential",
    "Issuer": "Issuer",
    "AddCredential": "Add Credential",
    "EmptyList": "Your wallet is empty.",
    "AddFirstCredential": "Add your first credential",
    "UnknownIssuer": "Unknown issuer",
    "UnknownVerifier": "Unknown verifier"
  },
  "CredentialOffer": {
    "EnterCredentialPIN": "Please enter credential PIN",
    "CredentialAddedToYourWallet": "Your credential is good to go now!",
    "CredentialOnTheWay": "Your credential is on the way.",
    "IssuedBy": "Issued by"
  },
  "ProofRequest": {
    "RequestedInformation": "Requested information",
    "PresentationOnTheWay": "Your presentation is on the way.",
    "PresentationAccepted": "You're in! \nYour presentation has been accepted.",
  },
  "Notifications": {
    "CredentialOffer": "Credential offer",
    "Credential": "Credential",
    "ProofRequest": "Proof request",
    "ProofPresentation": "Proof presentation",
    "CredentialRevoked": "Credential revoked",
    "Received": "Received",
    "Requested": "Requested",
    "Sent": "Sent",
    "Accepted": "Accepted",
    "Declined": "Declined",
  },
  "Onboarding": {
    "Welcome": "Welcome",
    "WelcomeParagraph1": "Heka Wallet App allows you to receive, store and use digital credentials.",
    "WelcomeParagraph2": "It is highly secure, and helps protect your privacy online.",
    "StoredSecurelyTitle": "Digital credentials, stored securely",
    "StoredSecurelyBody": "Heka Wallet App holds digital credentials — the digital versions of things like licenses, identities, permits, medical prescriptions and etc. They are stored securely, only on this device.",
    "UsingCredentialsTitle": "Receiving and using credentials",
    "UsingCredentialsBody": "To receive and use credentials you use the “Scan” feature in the app to scan a special QR code. Information is sent and received over a private, encrypted connection.",
    "PrivacyConfidentiality": "Privacy and confidentiality",
    "PrivacyParagraph": "You approve every use of information from your Heka Wallet App. You also only share what is needed for a situation. App administration or other third parties are not informed on when and how you use your digital credentials.",
    "KeplrWalletTitle": "Keplr wallet integration",
    "KeplrWalletBody": "Heka Wallet App provides crypto wallet functionality by integrating open-source Keplr wallet. This wallet can be used to receive and transfer various crypto tokens.\n\nYou can access your crypto wallet using ”Open Keplr wallet” button on a home screen.",
    "GetStarted": "Get Started",
    "SkipA11y": "Skip introduction",
    "AlreadyHaveAWallet": "Already have a backed-up wallet?",
    "UseWalletRecovery": "Use wallet recovery",
    "RestoreWallet": "Restore wallet"
  },
  "Screens": {
    "Onboarding": "Heka Wallet",
  },
  "NetInfo": {
    "NoInternetConnectionTitle": "No internet connection",
    "NoInternetConnectionMessage": "You're unable to access services using Heka Wallet or receive credentials until you're back online.\n\nPlease check your internet connection."
  },
  "CameraDisclosure": {
    "AllowCameraUse": "Allow camera use",
    "CameraDisclosure": "The camera is used to scan QR codes that initiate a credential offer or credential request. No information about the images is stored, used for analytics, or shared.",
    "ToContinueUsing": "To continue using the Heka Wallet scan feature, please allow camera permissions.",
    "Allow": "Allow",
    "OpenSettings": "Open settings",
  },
  "Scan": {
    "ScanOnySpecial": "Only specific QR codes can be scanned by Heka Wallet.",
    "ScanOnlySpecial3": "Heka Wallet currently doesn't support adding digital credential by scanning or taking photos of physical ones.",
    "WhereToUseLink": "See where you can use Heka Wallet",
    "BadQRCodeDescription": "Ths QR code scanned doesn't work with Heka Wallet. Heka Wallet only works with participating services.\n\nIt currently can't add digital credentials by taking photos of physical ones."
  },
  "Settings": {
    "PoweredBy": "Powered by",
    "WhatAreContacts": "What are contacts?",
    "AppSettings": "App settings",
    "Account": "Account",
    "Troubleshoot": "Troubleshoot",
    "ShareLogs": "Share logs",
    "Information": "Information",
    "Terms": "Terms of use",
    "Introduction": "Introduction",
    "UserProfile": "User profile",
    "DeleteMyAccount": "Delete My Account",
    "DataManagement": "Data management",
    "ProximityPresentation": "Proximity presentation",
    "Logs": "Logs"
  },
  "UserProfile": {
    "UserId": "User ID",
    "Name": "Name",
    "Email": "Email",
    "NoConnectionInfoText": "No internet connection - data may be outdated"
  },
  "Developer": {
    "Environment": "Environment",
    "Production": "Production",
    "Development": "Development",
    "Test": "Test",
    "DeveloperMode": "Developer mode",
    "Toggle": "Toggle Developer Mode"
  },
  "ItemsList": {
    "Empty": "No items"
  },
  "Loading": {
    "GoBack": "Go back"
  },
  "Global": {
    "Accept": "Accept",
    "Decline": "Decline",
    "YesDecline": "Yes, decline",
    "DontDecline": "Don't decline",
    "DontRemove": "Don't remove",
    "Done": "Done",
    "Continue": "Continue"
  },
  "PINCreate": {
    "CreatePinTitle": "Create a PIN",
    "CreatePinText": "Create a PIN to secure your wallet. If you forget it, you may need to set up your wallet again and re-add your credentials.",
    "ReEnterPinTitle": "Re-enter PIN",
    "ReEnterPinText": "Re-enter a PIN to secure your wallet. If you forget it, you may need to set up your wallet again and re-add your credentials.",
    "EnterOldPinTitle": "Enter your old PIN",
    "EnterOldPinText": "Enter your current PIN to continue. If you forget this PIN, you may need to set up your wallet again and re-add your credentials.",
    "EnterNewPinTitle": "Enter a new PIN",
    "EnterNewPinText": "Choose a new PIN for your wallet. Make sure it's something you'll remember. If you forget it, you may need to set up your wallet again and re-add your credentials.",
    "ReEnterNewPinTitle": "Re-enter the new PIN",
    "ReEnterNewPinText": "Please confirm the new PIN to secure your wallet. If you forget it, you may need to set up your wallet again and re-add your credentials.",
  },
  "PINEnter": {
    "EnterPIN": "Enter your wallet PIN"
  },
  "Proof": {
    "SharedInformation": "Shared Information"
  },
  "Chat": {
    "YouConnected": "You connected with",
    "CredentialProposalSent": "Sent a credential proposal",
    "CredentialOfferReceived": "Sent a credential offer",
    "CredentialRequestSent": "Sent a credential request",
    "CredentialDeclined": "Declined a credential offer",
    "CredentialReceived": "Received a credential",
    "ProofRequestSent": "Sent a proof request",
    "ProofPresentationReceived": "Has sent you information",
    "ProofRequestReceived": "Received a proof request",
    "ProofRequestRejected": "Rejected a proof request",
    "ProofRequestRejectReceived": "Rejected a proof request",
    "ProofRequestSatisfied": "Shared information",
  }
}

export default translation
