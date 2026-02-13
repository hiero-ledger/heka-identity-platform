export interface Option {
  value: string;
  content: string;
}

export enum DidMethods {
  Key = 'key',
  Indy = 'indy',
  IndyBesu = 'indybesu',
  Hedera = 'hedera',
}

export const didMethodTypes: Array<Option> = [
  { value: DidMethods.Key, content: DidMethods.Key },
  { value: DidMethods.Indy, content: DidMethods.Indy },
  { value: DidMethods.IndyBesu, content: DidMethods.IndyBesu },
  { value: DidMethods.Hedera, content: DidMethods.Hedera },
];
