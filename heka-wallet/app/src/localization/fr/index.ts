// prettier-ignore
const translation = {
  "Common": {
    "Next": "Suivant",
    "Confirm": "Confirmer",
    "Advanced": "Avancé",
    "CopyToClipboard": "Copier dans le presse-papiers",
    "Available": "Disponible",
    "Send": "Envoyer",
    "Low": "Faible",
    "Average": "Moyen",
    "High": "Élevé",
    "Security": "Sécurité",
    "NotSpecified": "Non spécifié",
    "Scan": "Scanner",
    "Code": "Code",
    "CreateNew": "Créer nouveau",
    "UseExisting": "Utiliser existant"
  },
  "Auth": {
    "Login": "Se connecter"
  },
  "Home": {
    "Credentials": "Certificats",
    "Notifications": "Notifications",
    "Chats": "Chats",
    "CredentialsGuide": "Scannez un QR code spécial pour recevoir et utiliser vos certificats",
    "NotificationsEmpty": "Vous n'avez pas de notifications",
    "ChatsEmpty": "Vous n'avez pas de conversations",
    "AllCredentials": "Tous les certificats"
  },
  "ContactDetails": {
    "RemoveContact": "Supprimer le contact",
    "GoToCredentials": "Aller aux certificats"
  },
  "CredentialDetails": {
    "ShowAll": "Afficher tous les champs",
    "HideAll": "Masquer tous les champs",
    "Remove": "Supprimer"
  },
  "TabStack": {
    "Coins": "Pièces",
    "Settings": "Paramètres"
  },
  "Passkeys": {
    "PasskeyAuth": "Authentification par clé d'accès",
    "SelectAuthOption": "Veuillez sélectionner une option d'authentification par clé d'accès",
    "AuthenticateWithExisting": "Authentifiez-vous avec une clé d'accès existante",
    "CreateNew": "Créer une nouvelle clé d'accès"
  },
  "WalletBackup": {
    "WalletRestore": "Restaurer le portefeuille",
    "BackupIsAvailable": "La sauvegarde est disponible",
    "BackupIsNotAvailable": "La sauvegarde n'est pas disponible",
    "BackupWallet": "Sauvegarder le portefeuille",
    "BackupingWallet": "Sauvegarde en cours...",
    "RestoreWallet": "Restaurer le portefeuille",
    "UsePasskeyToAuth": "Veuillez utiliser la clé d'accès pour vous authentifier auprès du service de sauvegarde"
  },
  "Crypto": {
    "Title": "Portefeuille Keplr",
    "Balance": "Solde",
    "Token": "Jeton",
    "Staked": "En staking",
    "ConfirmTransaction": "Confirmer la transaction",
    "MnemonicSeed": "Phrase mnémonique",
    "HardwareWallet": "Portefeuille matériel",
    "PrivateKey": "Clé privée",
    "Register": {
      "NewWallet": "Créer un nouveau portefeuille",
      "ImportExisting": "Importer un portefeuille existant",
      "ImportLedgerNano": "Importer Ledger Nano X",
      "CompletedTitle": "Tout est prêt !",
      "CompletedText": "Votre voyage inter-chaînes cosmique commence maintenant",
      "MnemonicBackupRecommendation": "Sauvegardez votre phrase mnémonique de manière sécurisée",
      "NewMnemonic": {
        "Title": "Sauvegardez votre portefeuille",
        "InfoText1": "Votre phrase mnémonique secrète est utilisée pour récupérer vos cryptos si vous perdez votre téléphone ou changez de portefeuille.",
        "InfoText2": "Conservez ces 12 mots dans un endroit sécurisé, comme un gestionnaire de mots de passe, et ne les partagez jamais avec personne."
      },
      "VerifyMnemonic": {
        "Title": "Vous l'avez sauvegardée, n'est-ce pas ?",
        "InfoText": "Vérifiez que vous avez sauvegardé votre phrase mnémonique secrète en tapant les mots dans l'ordre :"
      },
      "ImportWallet": {
        "Title": "Importer votre portefeuille",
        "InfoText": "Importez votre portefeuille avec la phrase mnémonique de 12 mots que vous avez sauvegardée."
      },
      "Form": {
        "WalletLabel": {
          "Label": "Nom du portefeuille",
          "Required": "Le nom est requis"
        },
        "Password": {
          "Label": "Mot de passe",
          "Required": "Le mot de passe est requis",
          "Invalid": "Mot de passe invalide",
          "TooShort": "Le mot de passe doit comporter plus de 8 caractères"
        },
        "ConfirmPassword": {
          "Label": "Confirmer le mot de passe",
          "Required": "La confirmation du mot de passe est requise",
          "TooShort": "Le mot de passe doit comporter plus de 8 caractères",
          "DoesntMatch": "Les mots de passe ne correspondent pas"
        },
        "Mnemonic": {
          "Label": "Phrase mnémonique",
          "Required": "La phrase mnémonique est requise",
          "TooShort": "La phrase mnémonique doit contenir au moins 8 mots",
          "Invalid": "Phrase mnémonique invalide",
          "InvalidPrivateKey": "Clé privée invalide",
          "InvalidPrivateKeyLength": "Longueur de la clé privée invalide"
        }
      },
      "BIP44": {
        "HDDerivationPath": "Chemin de dérivation HD",
        "Description": "Définissez un chemin de dérivation d'adresse personnalisé en modifiant les index ci-dessous :",
        "InvalidChange": "La valeur de change doit être 0 ou 1"
      }
    },
    "Home": {
      "TotalBalance": "Solde total",
      "BIP44": {
        "SelectAccount": "Sélectionner un compte",
        "PreviousTxs": "Transactions précédentes"
      },
      "Tokens": {
        "ViewAll": "Voir tous les jetons"
      }
    },
    "Account": {
      "KeplrAccount": "Compte Keplr",
      "NoAccount": "Aucun compte",
      "SelectAccount": "Sélectionner un compte",
      "Selected": "{{name}} (Sélectionné)",
      "RemoveAccount": "Supprimer le compte {{name}}"
    },
    "Send": {
      "Recipient": "Destinataire",
      "Amount": "Montant",
      "Memo": "Note (Optionnel)",
      "Fee": "Frais",
      "Gas": "Gaz"
    },
    "Unlock": {
      "SignIn": "Se connecter",
      "UseBiometry": "Utiliser l'authentification biométrique"
    },
    "Error": {
      "Unknown": "Erreur inconnue",
      "ErrorCode": "Code d'erreur",
      "InvalidBech32Error": "Adresse invalide",
      "ICNSFailedToFetchError": "Échec de récupération de l'adresse depuis ICNS",
      "InvalidNumberAmountError": "Nombre invalide",
      "ZeroAmountError": "Le montant est zéro",
      "NegativeAmountError": "Le montant est négatif",
      "InsufficientAmountError": "Fonds insuffisants",
      "InsufficientFeeError": "Solde insuffisant pour les frais de transaction"
    }
  },
  "Biometry": {
    "Biometrics": "Biométrie",
    "Enable": "Activer la biométrie",
    "Toggle": "Basculer la biométrie",
    "EnabledText1": "Connectez-vous avec la biométrie de votre téléphone plutôt qu'avec le code PIN de votre portefeuille. Cela signifie que toutes les données d'empreintes digitales et faciales ajoutées sur ce téléphone peuvent être utilisées pour accéder à votre application Heka Wallet.",
    "EnabledText2": "Assurez-vous que seul vous pouvez accéder à votre application Heka Wallet.",
    "Warning": "Assurez-vous que seul vous pouvez accéder à votre application Heka Wallet.",
    "UseToUnlock": "Utiliser la biométrie pour déverrouiller l'application",
    "Skip": "Passer",
    "EnabledTitle": "Autoriser l'utilisation de la biométrie",
    "EnabledDescription": "Configurez la biométrie dans les paramètres du dispositif",
    "OpenSettings": "Ouvrir les paramètres"
  },
  "Connection": {
    "MakingConnection": "Établir une connexion sécurisée.",
    "UnknownConnection": "Connexion inconnue"
  },
  "ConnectionDetails": {
    "Rename": "Renommer",
    "Delete": "Supprimer"
  },
  "Contacts": {
    "TypeHere": "Message"
  },
  "Credentials": {
    "Credential": "Certificat",
    "Issuer": "Émetteur",
    "AddCredential": "Ajouter un certificat",
    "EmptyList": "Votre portefeuille est vide.",
    "AddFirstCredential": "Ajoutez votre premier certificat",
    "UnknownIssuer": "Émetteur inconnu",
    "UnknownVerifier": "Vérificateur inconnu"
  },
  "CredentialOffer": {
    "EnterCredentialPIN": "Veuillez saisir le code PIN du certificat",
    "CredentialAddedToYourWallet": "Votre certificat est prêt à l'emploi !",
    "CredentialOnTheWay": "Votre certificat est en route.",
    "IssuedBy": "Émis par"
  },
  "ProofRequest": {
    "RequestedInformation": "Informations demandées",
    "PresentationOnTheWay": "Votre présentation est en route.",
    "PresentationAccepted": "Vous êtes dans ! \nVotre présentation a été acceptée."
  },
  "Notifications": {
    "CredentialOffer": "Offre de certificat",
    "Credential": "Certificat",
    "ProofRequest": "Demande de preuve",
    "ProofPresentation": "Présentation de preuve",
    "CredentialRevoked": "Certificat révoqué",
    "Received": "Reçu",
    "Requested": "Demandé",
    "Sent": "Envoyé",
    "Accepted": "Accepté",
    "Declined": "Refusé"
  },
  "Onboarding": {
    "Welcome": "Bienvenue",
    "WelcomeParagraph1": "L'application Heka Wallet vous permet de recevoir, stocker et utiliser des certificats numériques.",
    "WelcomeParagraph2": "Elle est hautement sécurisée et aide à protéger votre vie privée en ligne.",
    "StoredSecurelyTitle": "Certificats numériques, stockés en toute sécurité",
    "StoredSecurelyBody": "Heka Wallet stocke des certificats numériques — les versions numériques de documents tels que permis, identités, autorisations, ordonnances médicales, etc. Ils sont stockés de manière sécurisée, uniquement sur cet appareil.",
    "UsingCredentialsTitle": "Recevoir et utiliser des certificats",
    "UsingCredentialsBody": "Pour recevoir et utiliser des certificats, utilisez la fonction « Scanner » dans l'application pour scanner un QR code spécial. Les informations sont échangées via une connexion privée et cryptée.",
    "PrivacyConfidentiality": "Confidentialité et protection de la vie privée",
    "PrivacyParagraph": "Vous autorisez chaque utilisation des informations de votre application Heka Wallet. Vous ne partagez que ce qui est nécessaire pour une situation donnée. L'administration de l'application ou des tiers ne sont pas informés de l'utilisation de vos certificats numériques.",
    "KeplrWalletTitle": "Intégration du portefeuille Keplr",
    "KeplrWalletBody": "Heka Wallet offre une fonctionnalité de portefeuille crypto en intégrant le portefeuille open-source Keplr. Ce portefeuille peut être utilisé pour recevoir et transférer divers jetons cryptographiques.\n\nVous pouvez accéder à votre portefeuille crypto en utilisant le bouton « Ouvrir le portefeuille Keplr » sur l'écran d'accueil.",
    "GetStarted": "Commencer",
    "SkipA11y": "Passer l'introduction",
    "AlreadyHaveAWallet": "Vous avez déjà un portefeuille sauvegardé ?",
    "UseWalletRecovery": "Utiliser la récupération du portefeuille",
    "RestoreWallet": "Restaurer le portefeuille"
  },
  "Screens": {
    "Onboarding": "Heka Wallet"
  },
  "NetInfo": {
    "NoInternetConnectionTitle": "Pas de connexion Internet",
    "NoInternetConnectionMessage": "Vous ne pouvez pas accéder aux services via Heka Wallet ni recevoir de certificats tant que vous n'êtes pas reconnecté.\n\nVeuillez vérifier votre connexion Internet."
  },
  "CameraDisclosure": {
    "AllowCameraUse": "Autoriser l'utilisation de la caméra",
    "CameraDisclosure": "La caméra est utilisée pour scanner des QR codes qui initient une offre ou une demande de certificat. Aucune information sur les images n'est stockée, utilisée pour l'analyse ou partagée.",
    "ToContinueUsing": "Pour continuer à utiliser la fonction de scan de Heka Wallet, veuillez autoriser les permissions de la caméra.",
    "Allow": "Autoriser",
    "OpenSettings": "Ouvrir les paramètres"
  },
  "Scan": {
    "ScanOnySpecial": "Seuls des QR codes spécifiques peuvent être scannés par Heka Wallet.",
    "ScanOnlySpecial3": "Heka Wallet ne prend actuellement pas en charge l'ajout de certificats numériques en scannant ou en prenant des photos de documents physiques.",
    "WhereToUseLink": "Voir où vous pouvez utiliser Heka Wallet",
    "BadQRCodeDescription": "Le QR code scanné n'est pas compatible avec Heka Wallet. Heka Wallet fonctionne uniquement avec des services participants.\n\nIl ne peut pas ajouter de certificats numériques en prenant des photos de documents physiques."
  },
  "Settings": {
    "PoweredBy": "Propulsé par",
    "WhatAreContacts": "Que sont les contacts ?",
    "AppSettings": "Paramètres de l'application",
    "Account": "Compte",
    "Troubleshoot": "Dépannage",
    "ShareLogs": "Partager les journaux",
    "Information": "Informations",
    "Terms": "Conditions d'utilisation",
    "Introduction": "Introduction",
    "UserProfile": "Profil utilisateur",
    "DeleteMyAccount": "Supprimer mon compte",
    "DataManagement": "Gestion des données",
    "ProximityPresentation": "Présentation en proximité",
    "Logs": "Journaux"
  },
  "UserProfile": {
    "UserId": "ID utilisateur",
    "Name": "Nom",
    "Email": "Email",
    "NoConnectionInfoText": "Pas de connexion Internet - les données peuvent être obsolètes"
  },
  "Developer": {
    "Environment": "Environnement",
    "Production": "Production",
    "Development": "Développement",
    "Test": "Test",
    "DeveloperMode": "Mode développeur",
    "Toggle": "Basculer le mode développeur"
  },
  "ItemsList": {
    "Empty": "Aucun élément"
  },
  "Loading": {
    "GoBack": "Retourner en arrière"
  },
  "Global": {
    "Accept": "Accepter",
    "Decline": "Refuser",
    "YesDecline": "Oui, refuser",
    "DontDecline": "Ne pas refuser",
    "DontRemove": "Ne pas supprimer",
    "Done": "Terminé",
    "Continue": "Continuer"
  },
  "PINCreate": {
    "CreatePinTitle": "Créer un code PIN",
    "CreatePinText": "Créez un code PIN pour sécuriser votre portefeuille. Si vous l'oubliez, vous devrez peut-être reconfigurer votre portefeuille et réajouter vos certificats.",
    "ReEnterPinTitle": "Saisir à nouveau le code PIN",
    "ReEnterPinText": "Saisissez à nouveau un code PIN pour sécuriser votre portefeuille. Si vous l'oubliez, vous devrez peut-être reconfigurer votre portefeuille et réajouter vos certificats.",
    "EnterOldPinTitle": "Entrez votre ancien code PIN",
    "EnterOldPinText": "Entrez votre code PIN actuel pour continuer. Si vous l'oubliez, vous devrez peut-être reconfigurer votre portefeuille et réajouter vos certificats.",
    "EnterNewPinTitle": "Entrez un nouveau code PIN",
    "EnterNewPinText": "Choisissez un nouveau code PIN pour votre portefeuille. Assurez-vous qu'il s'agisse de quelque chose dont vous vous souviendrez. Si vous l'oubliez, vous devrez peut-être reconfigurer votre portefeuille et réajouter vos certificats.",
    "ReEnterNewPinTitle": "Confirmez le nouveau code PIN",
    "ReEnterNewPinText": "Veuillez confirmer le nouveau code PIN pour sécuriser votre portefeuille. Si vous l'oubliez, vous devrez peut-être reconfigurer votre portefeuille et réajouter vos certificats."
  },
  "PINEnter": {
    "EnterPIN": "Entrez le code PIN de votre portefeuille"
  },
  "Proof": {
    "SharedInformation": "Informations partagées"
  },
  "Chat": {
    "YouConnected": "Vous êtes connecté avec",
    "CredentialProposalSent": "A envoyé une proposition de certificat",
    "CredentialOfferReceived": "A envoyé une offre de certificat",
    "CredentialRequestSent": "A envoyé une demande de certificat",
    "CredentialDeclined": "A refusé une offre de certificat",
    "CredentialReceived": "A reçu un certificat",
    "ProofRequestSent": "A envoyé une demande de preuve",
    "ProofPresentationReceived": "Vous a envoyé des informations",
    "ProofRequestReceived": "A reçu une demande de preuve",
    "ProofRequestRejected": "A rejeté une demande de preuve",
    "ProofRequestRejectReceived": "A rejeté une demande de preuve",
    "ProofRequestSatisfied": "A partagé des informations"
  }
}

export default translation
