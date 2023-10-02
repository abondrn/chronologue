import axios, { AxiosResponse } from 'axios';

export interface Checklist {
    id: number;
    name: string;
    updated_at: string;
    public: boolean;
    options: number;
    created_at: string;
    'markdown?': boolean;
    archived: boolean;
    read_only: boolean;
    user_count: number;
    user_updated_at: string;
    related_task_ids: null | number[];
    percent_completed: number;
    task_count: number;
    task_completed: number;
    item_count: number;
    tags: Record<string, unknown>;
    tags_as_text: string;
}


export interface Task {
    id: number;
    parent_id: number;
    checklist_id: number;
    status: number;
    position: number;
    tasks: number[];
    update_line: string;
    updated_at: string;
    created_at: string;
    due: string | null;
    content: string;
    collapsed: boolean;
    comments_count: number;
    assignee_ids: number[];
    due_user_ids: number[];
    details: Record<string, string>;
    backlink_ids: number[];
    link_ids: number[];
    tags: Record<string, unknown>;
    tags_as_text: string;
    notes: any[]; // Type 'any' can be replaced with a more specific type if available
}


export function permalink(task: Task): string {
  return `https://checkvist.com/checklists/${task.checklist_id}/tasks/${task.id}`;
}


export interface NewTask {
    content: string;
    parent_id?: number;
    tags?: string;
    due_date?: string | null;
    position?: number;
    status?: number;
}


export interface UpdateTaskData {
    content?: string;
    parent_id?: number;
    tags?: string;
    due_date?: string;
    position?: number;
    parse?: boolean;
    with_notes?: boolean;
}


export interface Note {
    id: number;                  // Unique ID of the note
    comment: string;             // The text content of the note
    task_id: number;             // ID of the task that contains this note
    user_id: number;             // ID of the user who added this note
    username: string;            // Username of the user who added this note
    updated_at: string;          // Timestamp of the last change of the note
                                 // Format: '2005/02/01 15:15:10 +0000'
                                 // This timestamp can be passed to a JavaScript Date object
    created_at: string;          // Timestamp of the note creation
                                 // Format: '2005/02/01 15:15:10 +0000'
                                 // This timestamp can be passed to a JavaScript Date object
}


export class Session {
    private token: string | null;
    private apiBaseURL: string;

    constructor(private username: string, private remoteKey: string) {
      this.token = null;
      this.apiBaseURL = 'https://checkvist.com';
    }
  
    private async fetchToken(): Promise<void> {
        const url = `${this.apiBaseURL}/auth/login.json?version=2`;
        try {
            const response: AxiosResponse<{ token: string }> = await axios.post(url, {
                username: this.username,
                remote_key: this.remoteKey,
            });

            this.token = response.data.token;
        } catch (error) {
            console.error('Error:', error);
            throw new Error('Failed to fetch token');
        }
    }

    private async refreshAccessToken(): Promise<void> {
        if (!this.token) {
            throw new Error('Access token not available');
        }

        const url = `${this.apiBaseURL}/auth/refresh_token.json?version=2`;
        try {
            const response: AxiosResponse<{ token: string }> = await axios.post(url, {
                old_token: this.token,
            });

            this.token = response.data.token;
        } catch (error) {
            console.error('Error:', error);
            throw new Error('Failed to refresh token');
        }
    }

    public async getToken(): Promise<string> {
      if (!this.token) {
        await this.fetchToken();
      }
      return this.token!;
    }

    public async refreshToken(): Promise<void> {
        await this.refreshAccessToken();
    }

  /**
   * Fetch the list of user checklists.
   * @param archived If set to true, returns archived lists.
   * @param order The order in which checklists are sorted. For example, "id:asc" or "updated_at:desc".
   * @param skipStats If true, the request will be executed faster, at the price of missing stats about the number of users/tasks in each list.
   * @returns A Promise containing an array of checklists in JSON format.
   */
  public async getChecklists(params: { archived?: boolean; order?: string; skipStats?: boolean }): Promise<Checklist[]> {
    const url = `${this.apiBaseURL}/checklists.json`;
    const response: AxiosResponse<Checklist[]> = await axios.get(url, {
      headers: {
        'X-Client-Token': this.token,
      },
      params, // Pass the typed URL parameters directly here
    });

    if (!response.data) {
      throw new Error('Failed to fetch checklists');
    }

    return response.data;
  }

  /**
   * Get the list items of a checklist with the given ID.
   * @param checklistId The ID of the checklist.
   * @param withNotes If set to true, the result will contain information about notes added to the tasks.
   * @param order Allows overriding the sorting. Possible values: 'id:asc', 'id:desc', or 'updated_at:asc'.
   * @returns A Promise containing an array of task objects in JSON format.
   */
  public async getChecklistTasks(checklistId: number, withNotes: boolean = false, order: string = 'id:asc'): Promise<Task[]> {
    const url = `${this.apiBaseURL}/checklists/${checklistId}/tasks.json`;
    try {
      const response: AxiosResponse<Task[]> = await axios.get(url, {
        headers: {
            'X-Client-Token': this.token,
        },
        params: {
          with_notes: withNotes,
          order: order,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error:', error);
      throw new Error('Failed to fetch checklist tasks');
    }
  }


  /**
   * Create a new task in a checklist with the given ID.
   * @param checklistId The ID of the checklist where the task will be created.
   * @param newTaskData Object containing the data for the new task.
   * @returns A Promise containing the created task object in JSON format.
   */
  public async createTask(checklistId: number, newTaskData: NewTask): Promise<Task> {
    const url = `${this.apiBaseURL}/checklists/${checklistId}/tasks.json`;
    try {
      const response: AxiosResponse<Task> = await axios.post(url, newTaskData, {
        headers: {
            'X-Client-Token': this.token,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error:', error);
      throw new Error('Failed to create task');
    }
  }


  /**
   * Update the information of a specific task in a checklist.
   * @param checklistId The ID of the checklist where the task exists.
   * @param taskId The ID of the task to update.
   * @param data The data object containing the properties to update.
   * @returns A Promise containing the updated task object in JSON format.
   */
  public async updateTaskInfo(checklistId: number, taskId: number, data: UpdateTaskData): Promise<Task> {
    try {
      const url = `${this.apiBaseURL}/checklists/${checklistId}/tasks/${taskId}.json`;
      const response: AxiosResponse<Task> = await axios.put(url, data, {
        headers: {
            'X-Client-Token': this.token,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error:', error);
      throw new Error('Failed to update task information');
    }
  }


  /**
   * Delete a specific task from a checklist.
   * @param checklistId The ID of the checklist where the task exists.
   * @param taskId The ID of the task to delete.
   * @returns A Promise containing the deleted task object in JSON format.
   */
  public async deleteTask(checklistId: number, taskId: number): Promise<Task> {
    try {
      const url = `${this.apiBaseURL}/checklists/${checklistId}/tasks/${taskId}.json`;
      const response: AxiosResponse<Task> = await axios.delete(url, {
        headers: {
            'X-Client-Token': this.token,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error:', error);
      throw new Error('Failed to delete task');
    }
  }

  /**
   * Change the status of a specific task in a checklist.
   * @param checklistId The ID of the checklist where the task exists.
   * @param taskId The ID of the task to update.
   * @param action The status change action: 'close', 'invalidate', or 'reopen'.
   * @returns A Promise containing an array of updated task objects in JSON format.
   */
  public async changeTaskStatus(checklistId: number, taskId: number, action: 'close' | 'invalidate' | 'reopen'): Promise<Task[]> {
    try {
      const url = `${this.apiBaseURL}/checklists/${checklistId}/tasks/${taskId}/${action}.json`;
      const response: AxiosResponse<Task[]> = await axios.post(url, null, {
        headers: {
            'X-Client-Token': this.token,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error:', error);
      throw new Error('Failed to change task status');
    }
  }


  /**
   * Get the list of existing notes for a specific task in a checklist.
   * @param checklistId The ID of the checklist where the task exists.
   * @param taskId The ID of the task to get notes for.
   * @returns A Promise containing an array of notes for the task in JSON format.
   */
  public async getTaskNotes(checklistId: number, taskId: number): Promise<Note[]> {
    try {
      const url = `${this.apiBaseURL}/checklists/${checklistId}/tasks/${taskId}/comments.json`;
      const response: AxiosResponse<Note[]> = await axios.get(url, {
        headers: {
            'X-Client-Token': this.token,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error:', error);
      throw new Error('Failed to get task notes');
    }
  }

  /**
   * Create a new note for a specific task in a checklist.
   * @param checklistId The ID of the checklist where the task exists.
   * @param taskId The ID of the task to create a note for.
   * @param comment The text of the note to create.
   * @returns A Promise containing the created note object in JSON format.
   */
  public async createTaskNote(checklistId: number, taskId: number, comment: string): Promise<Note> {
    try {
      const url = `${this.apiBaseURL}/checklists/${checklistId}/tasks/${taskId}/comments.json`;
      const data = { comment };
      const response: AxiosResponse<Note> = await axios.post(url, data, {
        headers: {
            'X-Client-Token': this.token,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error:', error);
      throw new Error('Failed to create task note');
    }
  }

  /**
   * Update the text of a note for a specific task in a checklist.
   * @param checklistId The ID of the checklist where the task exists.
   * @param taskId The ID of the task that contains the note.
   * @param noteId The ID of the note to update.
   * @param comment The updated text of the note.
   * @returns A Promise containing the updated note object in JSON format.
   */
  public async updateTaskNote(checklistId: number, taskId: number, noteId: number, comment: string): Promise<Note> {
    try {
      const url = `${this.apiBaseURL}/checklists/${checklistId}/tasks/${taskId}/comments/${noteId}.json`;
      const data = { comment };
      const response: AxiosResponse<Note> = await axios.put(url, data, {
        headers: {
            'X-Client-Token': this.token,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error:', error);
      throw new Error('Failed to update task note');
    }
  }

  /**
   * Delete a specific note from a task in a checklist.
   * @param checklistId The ID of the checklist where the task exists.
   * @param taskId The ID of the task that contains the note.
   * @param noteId The ID of the note to delete.
   * @returns A Promise containing the deleted note object in JSON format.
   */
  public async deleteTaskNote(checklistId: number, taskId: number, noteId: number): Promise<Note> {
    try {
      const url = `${this.apiBaseURL}/checklists/${checklistId}/tasks/${taskId}/comments/${noteId}.json`;
      const response: AxiosResponse<Note> = await axios.delete(url, {
        headers: {
            'X-Client-Token': this.token,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error:', error);
      throw new Error('Failed to delete task note');
    }
  }


  /**
   * Create a copy of a task and its children and insert them on the same level as the previous task.
   * @param checklistId The ID of the checklist where the task exists.
   * @param taskId The ID of the task to be copied.
   * @returns A Promise containing the new copied task object in JSON format.
   */
  public async copyTaskWithChildren(checklistId: number, taskId: number, parent: Task | null, tasks: Task[] | null): Promise<number> {
    try {
      if (tasks === null) {
        tasks = await this.getChecklistTasks(checklistId, true, 'id:asc');
      }

      const taskToCopy: Task | undefined = tasks.find((task) => task.id === taskId);
      if (taskToCopy === undefined) throw new Error(`Task ID not found: ${taskId}`);

      // Create a new task object with updated due date (if in the past) and without the ID
      const newTaskData: NewTask = {
        content: taskToCopy.content,
        parent_id: parent ? parent.id : taskToCopy.parent_id,
        tags: taskToCopy.tags_as_text,
        due_date: this.updateDueDate(taskToCopy.due),
        position: parent ? parent.tasks.length + 1 : taskToCopy.position + 1,
        status: 0, // even if the copied task is not open, the copied task must be
      };

      // Create the new task in the same checklist
      const newTask: Task = await this.createTask(checklistId, newTaskData);

      // Recursively copy children tasks and update their parent IDs and positions
      if (taskToCopy.tasks && taskToCopy.tasks.length > 0) {
        for (const childTaskId of taskToCopy.tasks) {
          await this.copyTaskWithChildren(checklistId, childTaskId, newTask, tasks);
        }
      }

      return newTask.id;
    } catch (error) {
      console.error('Error:', error);
      throw new Error('Failed to copy task with children');
    }
  }

  /**
   * Helper method to update the due date to today if it is in the past.
   * @param dueDate The due date to be updated.
   * @returns The updated due date string.
   */
  private updateDueDate(dueDate: string | null): string | null {
    if (!dueDate) {
      return null;
    }

    const today = new Date().toISOString().split('T')[0];
    return dueDate < today ? today : dueDate;
  }


  /**
   * Create a list of subtasks under a specific task.
   * If there are existing children tasks, new subtasks will be appended to the end.
   * @param checklistId The ID of the checklist where the task exists.
   * @param parentTask The parent Task object under which to add the subtasks.
   * @param subtasks The list of strings representing the subtasks' content.
   * @returns A Promise containing an array of the created subtask objects in JSON format.
   */
  public async createTasks(parentTask: Task, subtasks: string[]): Promise<Task[]> {
    try {
      const startPosition: number = parentTask.tasks.length + 1;

      return await Promise.all(
        subtasks.map(async (subtaskContent, index) =>
          await this.createTask(parentTask.checklist_id, {
            parent_id: parentTask.id,
            content: subtaskContent,
            position: startPosition + index,
          })
        )
      );
    } catch (error) {
      console.error('Error:', error);
      throw new Error('Failed to create subtasks');
    }
  }


}