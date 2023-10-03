/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * An Artifact either created by or submitted to the agent.
 */
export type Artifact = {
  /**
   * ID of the artifact.
   */
  artifact_id: string;
  /**
   * Whether the artifact has been created by the agent.
   */
  agent_created: boolean;
  /**
   * Filename of the artifact.
   */
  file_name: string;
  /**
   * Relative path of the artifact in the agent's workspace.
   */
  relative_path?: string | null;
};

