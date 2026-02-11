// prettier-ignore
const translation = {
  "Common": {
    "Next": "Próximo",
    "Confirm": "Confirmar",
    "Advanced": "Avançado",
    "CopyToClipboard": "Copiar para a área de transferência",
    "Available": "Disponível",
    "Send": "Enviar",
    "Low": "Baixo",
    "Average": "Médio",
    "High": "Alto",
    "Security": "Segurança",
    "NotSpecified": "Não especificado",
    "Scan": "Escanear",
    "Code": "Código",
    "CreateNew": "Criar novo",
    "UseExisting": "Usar existente"
  },
  "Auth": {
    "Login": "Entrar"
  },
  "Home": {
    "Credentials": "Credenciais",
    "Notifications": "Notificações",
    "Chats": "Chats",
    "CredentialsGuide": "Escaneie um código QR especial para receber e usar credenciais",
    "NotificationsEmpty": "Você não tem notificações",
    "ChatsEmpty": "Você não tem conversas",
    "AllCredentials": "Todas as credenciais"
  },
  "ContactDetails": {
    "RemoveContact": "Remover contato",
    "GoToCredentials": "Ir para as credenciais"
  },
  "CredentialDetails": {
    "ShowAll": "Mostrar todos os campos",
    "HideAll": "Ocultar todos os campos",
    "Remove": "Remover"
  },
  "TabStack": {
    "Coins": "Moedas",
    "Settings": "Configurações"
  },
  "Passkeys": {
    "PasskeyAuth": "Autenticação por chave de acesso",
    "SelectAuthOption": "Por favor, selecione a opção de autenticação por chave de acesso",
    "AuthenticateWithExisting": "Autenticar com chave de acesso existente",
    "CreateNew": "Criar nova chave de acesso"
  },
  "WalletBackup": {
    "WalletRestore": "Restaurar carteira",
    "BackupIsAvailable": "Backup disponível",
    "BackupIsNotAvailable": "Backup não disponível",
    "BackupWallet": "Fazer backup da carteira",
    "BackupingWallet": "Realizando backup...",
    "RestoreWallet": "Restaurar carteira",
    "UsePasskeyToAuth": "Por favor, use a chave de acesso para autenticar com o serviço de backup"
  },
  "Crypto": {
    "Title": "Carteira Keplr",
    "Balance": "Saldo",
    "Token": "Token",
    "Staked": "Em stake",
    "ConfirmTransaction": "Confirmar transação",
    "MnemonicSeed": "Semente mnemônica",
    "HardwareWallet": "Carteira de hardware",
    "PrivateKey": "Chave privada",
    "Register": {
      "NewWallet": "Criar nova carteira",
      "ImportExisting": "Importar carteira existente",
      "ImportLedgerNano": "Importar Ledger Nano X",
      "CompletedTitle": "Tudo pronto!",
      "CompletedText": "Sua jornada interchain cósmica começa agora",
      "MnemonicBackupRecommendation": "Faça backup seguro da sua semente mnemônica",
      "NewMnemonic": {
        "Title": "Faça backup da sua carteira",
        "InfoText1": "Sua frase mnemônica secreta é usada para recuperar suas criptomoedas caso você perca seu telefone ou troque de carteira.",
        "InfoText2": "Guarde essas 12 palavras em um local seguro, como um gerenciador de senhas, e nunca as compartilhe com ninguém."
      },
      "VerifyMnemonic": {
        "Title": "Você a salvou, certo?",
        "InfoText": "Verifique se você salvou sua frase mnemônica secreta tocando as palavras na ordem correta:"
      },
      "ImportWallet": {
        "Title": "Importe sua carteira",
        "InfoText": "Importe sua carteira com a frase mnemônica de 12 palavras que você fez backup."
      },
      "Form": {
        "WalletLabel": {
          "Label": "Rótulo da carteira",
          "Required": "O nome é obrigatório"
        },
        "Password": {
          "Label": "Senha",
          "Required": "Senha obrigatória",
          "Invalid": "Senha inválida",
          "TooShort": "A senha deve ter mais de 8 caracteres"
        },
        "ConfirmPassword": {
          "Label": "Confirmar senha",
          "Required": "Confirmar a senha é obrigatório",
          "TooShort": "A senha deve ter mais de 8 caracteres",
          "DoesntMatch": "As senhas não correspondem"
        },
        "Mnemonic": {
          "Label": "Semente mnemônica",
          "Required": "Semente mnemônica é obrigatória",
          "TooShort": "A semente mnemônica deve conter pelo menos 8 palavras",
          "Invalid": "Semente mnemônica inválida",
          "InvalidPrivateKey": "Chave privada inválida",
          "InvalidPrivateKeyLength": "Comprimento da chave privada inválido"
        }
      },
      "BIP44": {
        "HDDerivationPath": "Caminho de derivação HD",
        "Description": "Defina um caminho de derivação de endereço personalizado modificando os índices abaixo:",
        "InvalidChange": "A alteração deve ser 0 ou 1"
      }
    },
    "Home": {
      "TotalBalance": "Saldo Total",
      "BIP44": {
        "SelectAccount": "Selecionar conta",
        "PreviousTxs": "Transações anteriores"
      },
      "Tokens": {
        "ViewAll": "Ver todos os tokens"
      }
    },
    "Account": {
      "KeplrAccount": "Conta Keplr",
      "NoAccount": "Nenhuma conta",
      "SelectAccount": "Selecionar conta",
      "Selected": "{{name}} (Selecionado)",
      "RemoveAccount": "Remover conta {{name}}"
    },
    "Send": {
      "Recipient": "Destinatário",
      "Amount": "Quantidade",
      "Memo": "Observação (Opcional)",
      "Fee": "Taxa",
      "Gas": "Gás"
    },
    "Unlock": {
      "SignIn": "Entrar",
      "UseBiometry": "Usar autenticação biométrica"
    },
    "Error": {
      "Unknown": "Erro desconhecido",
      "ErrorCode": "Código de erro",
      "InvalidBech32Error": "Endereço inválido",
      "ICNSFailedToFetchError": "Falha ao buscar o endereço do ICNS",
      "InvalidNumberAmountError": "Número inválido",
      "ZeroAmountError": "O valor é zero",
      "NegativeAmountError": "O valor é negativo",
      "InsufficientAmountError": "Fundos insuficientes",
      "InsufficientFeeError": "Saldo insuficiente para a taxa de transação"
    }
  },
  "Biometry": {
    "Biometrics": "Biometria",
    "Enable": "Ativar biometria",
    "Toggle": "Alternar biometria",
    "EnabledText1": "Faça login com a biometria do seu telefone em vez do PIN da carteira. Isso significa que todos os dados de impressão digital e reconhecimento facial cadastrados neste telefone podem ser usados para acessar o aplicativo Heka Wallet.",
    "EnabledText2": "Garanta que somente você tenha acesso ao seu aplicativo Heka Wallet.",
    "Warning": "Garanta que somente você tenha acesso ao seu aplicativo Heka Wallet.",
    "UseToUnlock": "Usar biometria para desbloquear o aplicativo",
    "Skip": "Pular",
    "EnabledTitle": "Permitir uso de biometria",
    "EnabledDescription": "Configure a biometria nas configurações do dispositivo",
    "OpenSettings": "Abrir configurações"
  },
  "Connection": {
    "MakingConnection": "Estabelecendo uma conexão segura.",
    "UnknownConnection": "Conexão desconhecida"
  },
  "ConnectionDetails": {
    "Rename": "Renomear",
    "Delete": "Excluir"
  },
  "Contacts": {
    "TypeHere": "Mensagem"
  },
  "Credentials": {
    "Credential": "Credencial",
    "Issuer": "Emissor",
    "AddCredential": "Adicionar credencial",
    "EmptyList": "Sua carteira está vazia.",
    "AddFirstCredential": "Adicione sua primeira credencial",
    "UnknownIssuer": "Emissor desconhecido",
    "UnknownVerifier": "Verificador desconhecido"
  },
  "CredentialOffer": {
    "EnterCredentialPIN": "Por favor, insira o PIN da credencial",
    "CredentialAddedToYourWallet": "Sua credencial está pronta para uso!",
    "CredentialOnTheWay": "Sua credencial está a caminho.",
    "IssuedBy": "Emitido por"
  },
  "ProofRequest": {
    "RequestedInformation": "Informações solicitadas",
    "PresentationOnTheWay": "Sua apresentação está a caminho.",
    "PresentationAccepted": "Você está dentro! \nSua apresentação foi aceita."
  },
  "Notifications": {
    "CredentialOffer": "Oferta de credencial",
    "Credential": "Credencial",
    "ProofRequest": "Solicitação de prova",
    "ProofPresentation": "Apresentação de prova",
    "CredentialRevoked": "Credencial revogada",
    "Received": "Recebido",
    "Requested": "Solicitado",
    "Sent": "Enviado",
    "Accepted": "Aceito",
    "Declined": "Recusado"
  },
  "Onboarding": {
    "Welcome": "Bem-vindo",
    "WelcomeParagraph1": "O aplicativo Heka Wallet permite que você receba, armazene e use credenciais digitais.",
    "WelcomeParagraph2": "Ele é altamente seguro e ajuda a proteger sua privacidade online.",
    "StoredSecurelyTitle": "Credenciais digitais, armazenadas com segurança",
    "StoredSecurelyBody": "O Heka Wallet armazena credenciais digitais — versões digitais de documentos como licenças, identidades, autorizações, receitas médicas, etc. Elas são armazenadas de forma segura, apenas neste dispositivo.",
    "UsingCredentialsTitle": "Recebendo e utilizando credenciais",
    "UsingCredentialsBody": "Para receber e usar credenciais, utilize o recurso “Escanear” no aplicativo para escanear um código QR especial. As informações são enviadas e recebidas por meio de uma conexão privada e criptografada.",
    "PrivacyConfidentiality": "Privacidade e confidencialidade",
    "PrivacyParagraph": "Você aprova cada uso das informações do seu aplicativo Heka Wallet. Você também compartilha apenas o necessário para cada situação. A administração do aplicativo ou terceiros não são informados sobre quando e como você utiliza suas credenciais digitais.",
    "KeplrWalletTitle": "Integração com a carteira Keplr",
    "KeplrWalletBody": "O Heka Wallet oferece funcionalidade de carteira de criptomoedas integrando a carteira Keplr de código aberto. Esta carteira pode ser usada para receber e transferir vários tokens criptográficos.\n\nVocê pode acessar sua carteira de criptomoedas utilizando o botão “Abrir carteira Keplr” na tela inicial.",
    "GetStarted": "Começar",
    "SkipA11y": "Pular introdução",
    "AlreadyHaveAWallet": "Já possui uma carteira de backup?",
    "UseWalletRecovery": "Usar recuperação de carteira",
    "RestoreWallet": "Restaurar carteira"
  },
  "Screens": {
    "Onboarding": "Heka Wallet"
  },
  "NetInfo": {
    "NoInternetConnectionTitle": "Sem conexão com a internet",
    "NoInternetConnectionMessage": "Você não pode acessar os serviços usando o Heka Wallet ou receber credenciais até estar online.\n\nPor favor, verifique sua conexão com a internet."
  },
  "CameraDisclosure": {
    "AllowCameraUse": "Permitir uso da câmera",
    "CameraDisclosure": "A câmera é utilizada para escanear códigos QR que iniciam uma oferta ou solicitação de credencial. Nenhuma informação sobre as imagens é armazenada, utilizada para análise ou compartilhada.",
    "ToContinueUsing": "Para continuar usando o recurso de escaneamento do Heka Wallet, por favor permita o acesso à câmera.",
    "Allow": "Permitir",
    "OpenSettings": "Abrir configurações"
  },
  "Scan": {
    "ScanOnySpecial": "Apenas códigos QR específicos podem ser escaneados pelo Heka Wallet.",
    "ScanOnlySpecial3": "O Heka Wallet atualmente não suporta a adição de credenciais digitais por meio do escaneamento ou fotografias de documentos físicos.",
    "WhereToUseLink": "Veja onde você pode usar o Heka Wallet",
    "BadQRCodeDescription": "O código QR escaneado não é compatível com o Heka Wallet. O Heka Wallet funciona apenas com serviços participantes.\n\nAtualmente, não é possível adicionar credenciais digitais por meio de fotografias de documentos físicos."
  },
  "Settings": {
    "PoweredBy": "Powered by",
    "WhatAreContacts": "O que são contatos?",
    "AppSettings": "Configurações do aplicativo",
    "Account": "Conta",
    "Troubleshoot": "Solução de problemas",
    "ShareLogs": "Compartilhar logs",
    "Information": "Informações",
    "Terms": "Termos de uso",
    "Introduction": "Introdução",
    "UserProfile": "Perfil do usuário",
    "DeleteMyAccount": "Excluir minha conta",
    "DataManagement": "Gerenciamento de dados",
    "ProximityPresentation": "Apresentação por proximidade",
    "Logs": "Logs"
  },
  "UserProfile": {
    "UserId": "ID do usuário",
    "Name": "Nome",
    "Email": "Email",
    "NoConnectionInfoText": "Sem conexão com a internet - os dados podem estar desatualizados"
  },
  "Developer": {
    "Environment": "Ambiente",
    "Production": "Produção",
    "Development": "Desenvolvimento",
    "Test": "Teste",
    "DeveloperMode": "Modo desenvolvedor",
    "Toggle": "Alternar modo desenvolvedor"
  },
  "ItemsList": {
    "Empty": "Nenhum item"
  },
  "Loading": {
    "GoBack": "Voltar"
  },
  "Global": {
    "Accept": "Aceitar",
    "Decline": "Recusar",
    "YesDecline": "Sim, recusar",
    "DontDecline": "Não recusar",
    "DontRemove": "Não remover",
    "Done": "Concluído",
    "Continue": "Continuar"
  },
  "PINCreate": {
    "CreatePinTitle": "Criar um PIN",
    "CreatePinText": "Crie um PIN para proteger sua carteira. Se você esquecê-lo, pode ser necessário configurar sua carteira novamente e readicionar suas credenciais.",
    "ReEnterPinTitle": "Digite o PIN novamente",
    "ReEnterPinText": "Digite o PIN novamente para proteger sua carteira. Se você esquecê-lo, pode ser necessário configurar sua carteira novamente e readicionar suas credenciais.",
    "EnterOldPinTitle": "Digite seu PIN antigo",
    "EnterOldPinText": "Digite seu PIN atual para continuar. Se você esquecê-lo, pode ser necessário configurar sua carteira novamente e readicionar suas credenciais.",
    "EnterNewPinTitle": "Digite um novo PIN",
    "EnterNewPinText": "Escolha um novo PIN para sua carteira. Certifique-se de que seja algo que você se lembre. Se você esquecê-lo, pode ser necessário configurar sua carteira novamente e readicionar suas credenciais.",
    "ReEnterNewPinTitle": "Confirme o novo PIN",
    "ReEnterNewPinText": "Por favor, confirme o novo PIN para proteger sua carteira. Se você esquecê-lo, pode ser necessário configurar sua carteira novamente e readicionar suas credenciais."
  },
  "PINEnter": {
    "EnterPIN": "Digite o PIN da sua carteira"
  },
  "Proof": {
    "SharedInformation": "Informações compartilhadas"
  },
  "Chat": {
    "YouConnected": "Você se conectou com",
    "CredentialProposalSent": "Enviou uma proposta de credencial",
    "CredentialOfferReceived": "Enviou uma oferta de credencial",
    "CredentialRequestSent": "Enviou uma solicitação de credencial",
    "CredentialDeclined": "Recusou uma oferta de credencial",
    "CredentialReceived": "Recebeu uma credencial",
    "ProofRequestSent": "Enviou uma solicitação de prova",
    "ProofPresentationReceived": "Enviou informações para você",
    "ProofRequestReceived": "Recebeu uma solicitação de prova",
    "ProofRequestRejected": "Rejeitou uma solicitação de prova",
    "ProofRequestRejectReceived": "Rejeitou uma solicitação de prova",
    "ProofRequestSatisfied": "Compartilhou informações"
  }
}

export default translation
