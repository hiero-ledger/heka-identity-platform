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
  /** Moves the template after `previousTemplateId` (`null` = to the top); rejects when the update fails. */
  changeTemplateOrder: (
    templateId: string,
    previousTemplateId: string | null,
  ) => Promise<void>;
  deleteTemplate: (templateId: string) => Promise<void>;
  navigateOnCreateTemplate: string;
  navigateOnEditTemplate: string;
  navigateOnOpenTemplate: string;
}
