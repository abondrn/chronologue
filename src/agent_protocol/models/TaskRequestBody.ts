/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { TaskInput } from './TaskInput';

/**
 * Body of the task request.
 */
export type TaskRequestBody = {
  /**
   * Input prompt for the task.
   */
  input?: string | null;
  additional_input?: TaskInput;
};

