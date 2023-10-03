/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Artifact } from './Artifact';
import type { TaskRequestBody } from './TaskRequestBody';

export type Task = (TaskRequestBody & {
  /**
   * The ID of the task.
   */
  task_id: string;
  /**
   * A list of artifacts that the task has produced.
   */
  artifacts: Array<Artifact>;
});

