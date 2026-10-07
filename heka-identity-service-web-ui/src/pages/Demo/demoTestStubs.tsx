import { CredentialOfferContext } from '@/components/Steps/CredentialOffer/CredentialOffer';
import { NextStepName, StepDetails } from '@/components/Steps/Step.types';
import { PresentationRequestContext } from '@/components/Steps/VerificationRequest/VerificationRequest';
import { Schema } from '@/entities/Schema';

/*
 * Stand-ins for the shared wizard steps (each has its own tests). They expose the props a demo
 * page passes and the callbacks it wires up, so the page's flow can be driven step by step.
 */

export const SelectSchemaStub = (props: {
  title: string;
  schema?: Schema;
  setSchema: (value: Schema) => void;
  onNext: () => void;
  useDemo?: boolean;
}) => (
  <section>
    <h2>{props.title}</h2>
    <p>{`schema: ${props.schema?.name}; demo: ${props.useDemo}`}</p>
    <button
      onClick={() =>
        props.setSchema({
          id: 'schema-1',
          name: 'Passport',
          fields: [{ id: 'f-1', name: 'firstName' }],
        })
      }
    >
      Use Passport
    </button>
    <button onClick={props.onNext}>Next</button>
  </section>
);

export const FillCredentialDataStub = (props: {
  title: string;
  context: { schema?: Schema; credentialValues?: Record<string, string> };
  onPrev?: () => void;
  onNext: (values: Record<string, string>) => void;
  onSkip?: () => void;
}) => (
  <section>
    <h2>{props.title}</h2>
    <p>{`fill: ${props.context.schema?.name}`}</p>
    <p>{`values: ${JSON.stringify(props.context.credentialValues ?? null)}`}</p>
    {props.onPrev && <button onClick={props.onPrev}>Back</button>}
    {props.onSkip && <button onClick={props.onSkip}>Skip</button>}
    <button onClick={() => props.onNext({ firstName: 'Alice' })}>Issue</button>
  </section>
);

export const CredentialOfferStub = (props: {
  context: CredentialOfferContext;
  stepDetails: StepDetails<object>;
  onChangeStep: (step?: NextStepName<object>) => void;
}) => (
  <section>
    <h2>{props.stepDetails.title}</h2>
    <p>
      {`offer: ${props.context.protocolType}/${props.context.credentialType}; demo: ${props.context.useDemo}`}
    </p>
    <p>{`offered: ${JSON.stringify(props.context.credentialValues ?? null)}`}</p>
    <button onClick={() => props.onChangeStep(props.stepDetails.next?.name)}>
      {props.stepDetails.next?.title}
    </button>
  </section>
);

export const VerificationRequestStub = (props: {
  context: PresentationRequestContext;
  stepDetails: StepDetails<object>;
  onChangeStep: (step?: NextStepName<object>) => void;
}) => (
  <section>
    <h2>{props.stepDetails.title}</h2>
    <p>
      {`request: ${props.context.protocolType}/${props.context.credentialType}; schema: ${props.context.schema?.name}; demo: ${props.context.useDemo}`}
    </p>
    <button onClick={() => props.onChangeStep(props.stepDetails.next?.name)}>
      {props.stepDetails.next?.title}
    </button>
  </section>
);
