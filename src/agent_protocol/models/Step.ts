/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Artifact } from './Artifact';
import type { StepOutput } from './StepOutput';
import type { StepRequestBody } from './StepRequestBody';

export type Step = (StepRequestBody & {
  /**
   * The ID of the task this step belongs to.
   */
  task_id: string;
  /**
   * The ID of the task step.
   */
  step_id: string;
  /**
   * The name of the task step.
   */
  name?: string | null;
  /**
   * The status of the task step.
   */
  status: Step.status;
  /**
   * Output of the task step.
   */
  output?: string | null;
  additional_output?: StepOutput;
  /**
   * A list of artifacts that the step has produced.
   */
  artifacts: Array<Artifact>;
  /**
   * Whether this is the last step in the task.
   */
  is_last: boolean;
});

export namespace Step {

  /**
   * The status of the task step.
   */
  export enum status {
    CREATED = 'created',
    RUNNING = 'running',
    COMPLETED = 'completed',
  }


}

