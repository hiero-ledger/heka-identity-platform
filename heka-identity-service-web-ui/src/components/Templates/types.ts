import { IssuanceTemplate } from '@/entities/IssuanceTemplate';
import { VerificationTemplate } from '@/entities/VerificationTemplate';

export enum TemplateType {
  Issue = 'issue',
  Verification = 'verification',
}

export interface TemplatesState {
  templates: IssuanceTemplate[] | VerificationTemplate[];
  isLoading: boolean;
  error: string;
}

export interface TemplatesProps {
  templateType: TemplateType;
  templatesState: TemplatesState;
  changeTemplateOrder: (
    TemplateId: string,
    previousTemplateId?: string,
  ) => Promise<void>;
  deleteTemplate: (templateId: string) => Promise<void>;
  navigateOnCreateTemplate: string;
  navigateOnEditTemplate: string;
  navigateOnOpenTemplate: string;
}
