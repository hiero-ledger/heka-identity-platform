export type NextStepName<T> = string | ((context?: T) => string);

export interface StepNavigation<T> {
  title?: string;
  name?: NextStepName<T>;
}

export interface StepDetails<T> {
  title: string;
  name: string;
  prev?: StepNavigation<T>;
  next?: StepNavigation<T>;
}
