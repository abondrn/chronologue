/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { StepInput } from './StepInput';

/**
 * Body of the task request.
 */
export type StepRequestBody = {
  /**
   * Input prompt for the step.
   */
  input?: string | null;
  additional_input?: StepInput;
};

