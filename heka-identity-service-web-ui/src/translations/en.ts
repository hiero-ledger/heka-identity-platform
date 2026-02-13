export default {
  Common: {
    titles: {
      logo: 'Heka Identity Service',
      copyLink: 'click this link to copy.',
      scanQR: 'Scan QR code with your mobile wallet or',
      schemas: 'Schemes',
      templates: 'Templates',
      loadingSchemas: 'Loading schemes ...',
      loadingTemplates: 'Loading templates ...',
      smthWentWrong: 'Something went wrong!',
      confirmation: 'Do you confirm the action?',
    },
    buttons: {
      back: 'Back',
      next: 'Next',
      logo: 'Logo',
      background: 'Background color',
      esc: 'Esc',
      elevatedType: 'elevated',
      textType: 'text',
      saveAsTemplate: 'Save as template',
      plus: 'Plus',
      save: 'Save',
      saveAs: 'Save as',
      selectAll: 'Select all',
      menu: 'Menu',
      yes: 'Yes',
      cancel: 'Cancel',
    },
    imageAlts: {
      schemaLogo: 'Schema logo',
      issuerLogo: 'Issuer logo',
    },
    messages: {
      copyLink: 'Copied',
    },
  },
  Home: {
    titles: {
      main: 'Welcome to Self-Sovereign Identity',
      description:
        'With Heka Identity Service you can safely manage your identity on your own terms',
    },
    buttons: {
      start: 'Get started',
    },
  },
  Flow: {
    titles: {
      step: 'Step {{stepNumber}} of {{totalPreparationSteps}}',
      selectProtocol: 'Select protocol type',
      selectCredentialType: 'Select credential type',
      selectNetwork: 'Select network',
      selectDid: 'Select DID',
      selectSchema: 'Select schema',
      schemaRegistration: 'Registration of the schema',
      fillCredential: 'Issue new credential',
      credentialOffer: 'Credential offer',
      credentialSent: 'Credential Sent',
      requestFieldsVerification: 'Request fields verification',
      presentationRequest: 'Presentation Request',
      verificationRequest: 'Credential verification request',
      presentationReceived: 'Credential verified',
      verify: 'Verify Credential',
    },
    buttons: {
      issue: 'Issue',
      issueMore: 'Issue more credential',
      request: 'Request',
      verifyMore: 'Verify more credential',
      startAgain: 'Start again',
    },
  },
  Profile: {
    titles: {
      main: 'Profile',
      name: 'Name',
      password: 'Password',
      issuer: 'Issuer',
      preparation: 'Wait for the user to prepare',
      firstSignIn:
        'You were redirected to this page since you signed in for the first time',
      passwordChanged: 'Password changed successfully',
    },
    buttons: {
      submit: 'Save',
    },
  },
  Demo: {
    titles: {
      main: 'Demo',
    },
  },
  IssueCredential: {
    titles: {
      main: 'Issue credential',
      mainMobile: 'Issue',
      advancedIssue: 'Advanced issue',
      newTemplate: 'New issuance template',
      editTemplate: 'Edit issuance template',
      description: {
        templateName: 'Template: {{name}}',
        schemaName: 'Schema: {{name}}',
        target:
          'Protocol: {{protocol}}; Credential type: {{credentialFormat}}; Network: {{network}}',
        did: 'DID: {{did}}',
      },
    },
    buttons: {
      register: 'Register',
    },
    menuItemNames: {
      templates: 'Templates',
      schemas: 'Schemes',
      credentialDefinitions: 'Credential definitions',
      dids: 'DIDs',
      issuedCredentials: 'Issued credentials',
      advancedIssue: 'Advanced issue',
    },
    errors: {
      BadContext: 'Credential issuance context is invalid',
    },
    schema: {
      create: 'Create schema',
      registered: 'Registered {{count}} times',
      notRegistered: 'Not registered',
      noSchemas: 'There are no active schemes',
      noHiddenSchemas: 'There are no hidden schemes',
      noSchemasDescription: 'Use this button below to create a new schema.',
      noSchemasButtonTitle: 'Create schema',
      issuedBy: 'Issued by {{issuerName}}',
      hidden: 'Schema was hidden successfully',
      activated: 'Schema was activated successfully',
      actions: {
        edit: 'Edit',
        register: 'Register',
      },
      hints: {
        manage: 'Actions with schema',
        hide: 'Hide schema',
        show: 'Show schema',
        move: 'Move schema',
        registrations: 'View schema registrations',
        register: 'Register schema',
      },
      registrationList: {
        title: 'Registrations',
        empty: 'The schema is not registered',
        loading: 'Loading ...',
      },
      registrationDetails: {
        title: 'Registration',
        protocol: 'Protocol type',
        credentialFormat: 'Credential format',
        network: 'Network',
        did: 'DID',
        buttons: {
          submit: 'Register',
        },
        messages: {
          success: 'Schema was registered successfully',
        },
      },
    },
  },
  VerifyCredential: {
    titles: {
      main: 'Verify credential',
      newTemplate: 'New verification template',
      editTemplate: 'Edit verification template',
      mainMobile: 'Verify',
      advancedVerification: 'Advanced verification',
      description: {
        templateName: 'Template: {{name}}',
        schemaName: 'Schema: {{name}}',
        target: 'Protocol: {{protocol}}; Credential type: {{credentialFormat}}',
      },
    },
    warnings: {
      schemaIsNotRegistered:
        'The scheme is not yet registered. For verification, please register it first in the "Issue credential.Schemes" section.',
    },
    errors: {
      BadContext: 'Credential verification context is invalid',
    },
    menuItemNames: {
      templates: 'Templates',
      advancedVerification: 'Advanced verification',
    },
  },
  SignIn: {
    titles: {
      username: 'User name',
      password: 'Password',
      // forgotAccount: 'Forgot account?',
    },
    buttons: {
      signIn: 'Sign in',
      signOut: 'Sign out',
      createAccount: 'Create account',
    },
  },
  SignUp: {
    titles: {
      username: 'User name',
      password: 'Password',
      repeatPassword: 'Repeat password',
    },
    buttons: {
      createAccount: 'Create account',
    },
  },
  ChangePassword: {
    titles: {
      modal: 'Password',
      currentPassword: 'Current password',
      password: 'New password',
      confirmPassword: 'Confirm new password',
    },
    buttons: {
      save: 'Save',
    },
  },
  CreateSchema: {
    titles: {
      main: 'Create schema',
      schemaName: 'Schema name',
      credentialField: 'Credential field',
      newCredentialField: 'New credential field',
      addCredential: 'Add credential field',
      deleteCredential: 'Delete credential field',
      dndCredential: 'Change credential field position',
    },
    texts: {
      noCredentialFields: 'No credential fields',
      credentialFieldsRequired: 'Credential fields are required',
      credentialFieldsShouldBeUnique: 'Credential fields names must be unique',
    },
    buttons: {
      submit: 'Create',
    },
    messages: {
      success: 'Schema was created successfully',
    },
  },
  SchemaEditView: {
    buttons: {
      submit: 'Save',
    },
    messages: {
      success: 'Schema was saved successfully',
    },
  },
  SchemaRegistration: {
    titles: {
      main: 'Schema {{schemaName}} is not registered in this network',
      protocolType: 'Protocol type',
      credentialFormat: 'Credential format',
      network: 'Network',
      did: 'DID',
      schemaName: 'Schema',
    },
  },
  Template: {
    titles: {
      main: 'Save as template',
      templateName: 'Template name',
      noTemplates: 'There are no templates',
      noTemplatesDescription:
        'Use advanced {{templateType}} to create a new one.',
    },
    buttons: {
      create: 'Create template',
      submit: 'Save',
      edit: 'Edit',
      delete: 'Delete',
      cancelConfirm: 'No, cancel',
      deleteConfirm: 'Yes, delete it',
    },
    messages: {
      createSuccess: 'Template {{name}} was created successfully',
      updateSuccess: 'Template {{name}} was saved successfully',
      deleted: 'Template was deleted',
    },
    hints: {
      manage: 'Actions',
      move: 'Move template',
    },
    details: {
      issuance:
        'Schema: {{schema.name}}\r\nProtocol: {{protocol}}\r\nCredential type: {{credentialFormat}}\r\nNetwork: {{network}}\r\nDID: {{did}}',
      verification:
        'Schema: {{schema.name}}\r\nProtocol: {{protocol}}\r\nCredential type: {{credentialFormat}}',
    },
    warnings: {
      verification: {
        schemaIsNotRegistered:
          'The scheme is not yet registered. For create verification template, please register it first in the "Issue credential.Schemes" section.',
      },
    },
    confirmation: {
      deleteTemplate: 'This template will be deleted. Continue?',
    },
  },
  IssueFromTemplate: {
    titles: {
      description: {
        templateName: 'Template: {{name}}',
        schemaName: 'Schema: {{name}}',
        target:
          'Protocol: {{protocol}}; Credential type: {{credentialFormat}}; Network: {{network}}',
        did: 'DID: {{did}}',
      },
    },
    messages: {
      success: 'Template was updated successfully',
    },
  },
  VerificationFromTemplate: {
    titles: {
      description: {
        templateName: 'Template: {{name}}',
        schemaName: 'Schema: {{name}}',
        target: 'Protocol: {{protocol}}; Credential type: {{credentialFormat}}',
      },
    },
    messages: {
      success: 'Template was updated successfully',
    },
  },
};
