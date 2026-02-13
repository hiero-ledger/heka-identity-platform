export type WizardType = 'issue' | 'template' | 'demo';

export interface WizardContext {
  wizardType?: WizardType;
}
