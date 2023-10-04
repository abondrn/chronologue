import axios, { AxiosResponse } from 'axios';
import moment from 'moment';


export interface IChecklist {
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
    tags: Record<string, boolean>;
    tags_as_text: string;
}


type TaskCallback = (task: ITask) => any;


// TODO: create in-memory version for testing
// TODO: atomic operations
export class Checklist {
  private session: Session;
  private data: IChecklist;
  tasks: ITask[];
  top: ITask[];
  private tasksById!: Record<number, ITask>;
  private durationById!: Record<number, number | null>;
  private dueDateById!: Record<number, Date | null>;

  constructor(session: Session, data: IChecklist) {
    this.session = session;
    this.data = data;
    this.tasks = [];
    this.top = [];
    this.initializeById();
  }

  private initializeById() {
    this.tasksById = {};
    this.durationById = {};
    this.dueDateById = {};
  }

  get length(): number {
    return Object.keys(this.tasksById).length;
  }

  async update(): Promise<Checklist> {
    const tasks = await this.session.getChecklistTasks(this.data.id);
    this.tasks = tasks;
    this.top = tasks.filter((task) => task.parent_id === 0);
    this.initializeById();
    tasks.forEach((task) => {
      this.tasksById[task.id] = task;
    });
    return this;
  }

  subtaskDurationEstimateToMinutes(task: ITask) {
    const subdurations = task.tasks.map((id: number) => this.durationEstimateToMinutes(this.tasksById[id]));
    return subdurations.every((d) => d === null) ? null : sum(subdurations.map((d) => d || 0));
  }

  // TODO: sum durations by state
  durationEstimateToMinutes(task: ITask, includeSubtasks: boolean = true) {
    if (!(task.id in this.durationById)) {
      const subduration = this.subtaskDurationEstimateToMinutes(task);
      const duration = durationEstimateToMinutes(task);
      this.durationById[task.id] = (
        subduration === null && duration === null
        ? null
        : (duration || 0) + (subduration || 0)
      );
    }
    return this.durationById[task.id];
  }

  parent(task: ITask): ITask {
    return this.tasksById[task.parent_id];
  }

  dueDate(task: ITask) {
    if (!(task.id in this.dueDateById)) {
      const parsed = dueDate(task);
      this.dueDateById[task.id] = parsed !== null ? parsed : task.parent_id === 0 ? null : this.dueDate(this.parent(task));
    }
    return this.dueDateById[task.id];
  }

  // generates all tasks for which the predicate is true or has a parent where the predicate is true; optionally accepts a root task for the operation
  *select(predicate: TaskCallback, task?: ITask): Generator<ITask> {
    if (task) {
      if (predicate(task)) {
        yield *this.walk(task)
      } else {
        for (const childId of task.tasks) {
          yield* this.select(predicate, this.tasksById[childId]);
        }
      }
    } else {
      for (const t of this.top) {
        yield* this.select(predicate, t);
      }
    }
  }

  find(predicate: TaskCallback, task?: ITask): ITask | null {
    const first = this.select(predicate, task).next();
    return first.done ? null : first.value;
  }

  contains(predicate: TaskCallback, task?: ITask): boolean {
    return this.find(predicate, task) !== null;
  }

  // TODO: be able to specify which tasks to compute stats on
  stats() {
    const acc = {
      overdueMinutes: 0,
      overdueTaskCount: 0,
      averageOverdueDays: 0,
      tasksPerDay: 0,
      minutesPerDay: 0,
      unscheduled: 0,
      unestimated: 0,
      notes: 0,
      count: 0,
    };
    var dueEstimateCount = 0;
    this.tasks.forEach((task) => {
      const due = this.dueDate(task);
      const now = new Date();
      const minutes = durationEstimateToMinutes(task);
      const overdueDays = moment(now).diff(due, 'days');
      if (due === null) {
        acc.unscheduled += 1;
      } else if (due < now) {
        if (minutes !== null) acc.overdueMinutes += minutes;
        acc.overdueTaskCount += +hasSubtasks(task);
        acc.averageOverdueDays += overdueDays;
      } else {
        acc.tasksPerDay += +hasSubtasks(task) / (-overdueDays + 1);
        if (minutes !== null) {
          acc.minutesPerDay += minutes / (-overdueDays + 1);
          dueEstimateCount += 1;
        }
      }
      if (minutes === null) acc.unestimated += 1;
      if (due === null) acc.unscheduled += 1;
      acc.notes += task.notes?.length || 0;
    });
    acc.averageOverdueDays /= acc.overdueTaskCount;
    acc.minutesPerDay /= dueEstimateCount;
    acc.count += 1;
    return acc;
  }

  private *_walk(id: number): Generator<ITask> {
    yield this.tasksById[id];
    for (const childId of this.tasksById[id].tasks) {
      yield* this._walk(childId);
    }
  }

  walk(task: ITask) {
    return this._walk(task.id);
  }

  async setDurations(estimator: (task: ITask) => number | null) {
    this.tasks.forEach(async (task) => {
      const duration = estimator(task);
      if (duration !== null) {
        var unit;
        if (duration >= 2*MULTIPLIER['d'] || duration == MULTIPLIER['d']) {
          unit = 'd';
        } else if (duration >= 2*MULTIPLIER['h'] || duration == MULTIPLIER['h']) {
          unit = 'h';
        } else {
          unit = 'm';
        }
        const tag = `${Math.ceil(duration / MULTIPLIER[unit])}${unit}`;
        await this.addTags(task, [tag]);
      }
    });
    return this.update();
  }

  async bulkUpdate(updator: (task: ITask) => UpdateTaskData | null, callback: TaskCallback | null = null) {
    this.tasks.forEach(async (task) => {
      const data = updator(task);
      if (data !== null) {
        const updated = await this.session.updateTask(this.data.id, task.id, data);
        if (callback !== null) callback(updated);
      }
    });
    return this.update();
  }

  async bulkSchedule(scheduler: (task: ITask) => Date | null, callback: TaskCallback | null = null) {
    this.bulkUpdate((task) => {
      const date = scheduler(task);
      return date === null ? null : {'task[due_date]': moment(date).format('YYYY/MM/DD')};
    }, callback);
    return this.update();
  }

  async bulkChangeStatus(updator: (task: ITask) => StatusAction | null, callback: TaskCallback | null = null) {
    this.tasks.forEach(async (task) => {
      const data = updator(task);
      if (data !== null) {
        const updated = await this.session.changeTaskStatus(this.data.id, task.id, data);
        if (callback !== null) updated.forEach((t) => callback(t));
      }
    });
    return this.update();
  }

  // TODO: figure out how to remove tags
  async addTags(task: ITask, tags: string[]): Promise<ITask> {
    console.assert(this.data.id === task.checklist_id);
    if (tags.every((tag) => tag in task.tags)) return task;
    return await this.session.updateTask(this.data.id, task.id, {'task[tags]': tags.map((tag) => tag).join(',')});
  }
}


export enum Status {
  open = 0,
  closed = 1,
  invalidated = 2
}

export type StatusAction = 'close' | 'invalidate' | 'reopen';

export const statusToAction: Record<Status, StatusAction> = {
  [Status.open]: 'reopen',
  [Status.closed]: 'close',
  [Status.invalidated]: 'invalidate',
}


export interface ITask {
    id: number;
    parent_id: number;
    checklist_id: number;
    status: Status;
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
    due_user_ids?: number[];
    details: Record<string, string>;
    backlink_ids: number[];
    link_ids: number[];
    tags: Record<string, unknown>;
    tags_as_text: string;
    notes?: string[];
}


export function dueDate(task: ITask): Date | null {
  if (task.due === null) return null;
  const parts = task.due.split(/\//).map((part) => parseInt(part, 10));
  console.assert(parts.length === 3)
  return new Date(
    parts[0], parts[1], parts[2]
  );
}


function sum(nums: number[]) {
  return nums.reduce((a, b) => a + b, 0);
}


const
  ESTIMATE = /^(\d+)([mhd])$/,
  MULTIPLIER: any = {
    m: 1,
    h: 60,
    d: 8 * 60
  };
export function durationEstimateToMinutes(task: ITask) {
  for (const tag of Object.keys(task.tags)) {
    const m = tag.match(ESTIMATE);
    if (m) {
      const minutes: number = parseInt(m[1], 10) * MULTIPLIER[m[2]]
      return minutes;
    }
  }
  return null;
}


const BASE_URL = 'https://checkvist.com';

export const
  permalink = (task: ITask) => `${BASE_URL}/checklists/${task.checklist_id}/tasks/${task.id}`,
  hasDueDate = (task: ITask) => task.due !== null,
  hasSubtasks = (task: ITask) => task.tasks.length !== 0; 


export interface NewTaskData {
    'task[content]': string;
    'task[parent_id]'?: number;
    'task[tags]'?: string;
    'task[due_date]'?: string | null;
    'task[position]'?: number;
    'task[status]'?: Status;
}


export interface UpdateTaskData {
    'task[content]'?: string;
    'task[parent_id]'?: number;
    'task[tags]'?: string;
    'task[due_date]'?: string;
    'task[position]'?: number;
    parse?: boolean;
    with_notes?: boolean;
}


export interface INote {
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
      this.apiBaseURL = BASE_URL;
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
  public async getChecklists(params: { archived?: boolean; order?: string; skipStats?: boolean }): Promise<IChecklist[]> {
    const url = `${this.apiBaseURL}/checklists.json`;
    const response: AxiosResponse<IChecklist[]> = await axios.get(url, {
      headers: {
        'X-Client-Token': this.token,
      },
      params,
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
  public async getChecklistTasks(checklistId: number, withNotes: boolean = false, order: 'id:asc' | 'id:desc' | 'updated_at:asc' = 'id:asc'): Promise<ITask[]> {
    const url = `${this.apiBaseURL}/checklists/${checklistId}/tasks.json`;
    try {
      const response: AxiosResponse<ITask[]> = await axios.get(url, {
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
  async _createTask(checklistId: number, data: NewTaskData): Promise<ITask> {
    const url = `${this.apiBaseURL}/checklists/${checklistId}/tasks.json`;
    try {
      const response: AxiosResponse<ITask> = await axios.post(url, data, {
        headers: {
            'X-Client-Token': this.token,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error:', error);
      throw new Error('Failed to create task');
    }
  }


  public async createTask(opts: {
    checklist_id: number,
    content: string,
    parent_id?: number,
    tags?: string,
    due_date?: string | null,
    position?: number,
    status?: Status,
  }): Promise<ITask> {
    return await this._createTask(opts.checklist_id, {
      'task[content]': opts.content,
      'task[parent_id]': opts.parent_id,
      'task[tags]': opts.tags,
      'task[due_date]': opts.due_date,
      'task[position]': opts.position,
      'task[status]': opts.status,
    });
  }


  /**
   * Update the information of a specific task in a checklist.
   * @param checklistId The ID of the checklist where the task exists.
   * @param taskId The ID of the task to update.
   * @param data The data object containing the properties to update.
   * @returns A Promise containing the updated task object in JSON format.
   */
  public async updateTask(checklistId: number, taskId: number, data: UpdateTaskData): Promise<ITask> {
    try {
      const url = `${this.apiBaseURL}/checklists/${checklistId}/tasks/${taskId}.json`;
      const response: AxiosResponse<ITask> = await axios.put(url, data, {
        headers: {
            'X-Client-Token': this.token,
            'Content-Type': 'application/x-www-form-urlencoded',
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
  public async deleteTask(checklistId: number, taskId: number): Promise<ITask> {
    try {
      const url = `${this.apiBaseURL}/checklists/${checklistId}/tasks/${taskId}.json`;
      const response: AxiosResponse<ITask> = await axios.delete(url, {
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
  public async changeTaskStatus(checklistId: number, taskId: number, action: StatusAction): Promise<ITask[]> {
    try {
      const url = `${this.apiBaseURL}/checklists/${checklistId}/tasks/${taskId}/${action}.json`;
      const response: AxiosResponse<ITask[]> = await axios.post(url, null, {
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
  public async getTaskNotes(checklistId: number, taskId: number): Promise<INote[]> {
    try {
      const url = `${this.apiBaseURL}/checklists/${checklistId}/tasks/${taskId}/comments.json`;
      const response: AxiosResponse<INote[]> = await axios.get(url, {
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
  public async createTaskNote(checklistId: number, taskId: number, comment: string): Promise<INote> {
    try {
      const url = `${this.apiBaseURL}/checklists/${checklistId}/tasks/${taskId}/comments.json`;
      const data = { comment };
      const response: AxiosResponse<INote> = await axios.post(url, data, {
        headers: {
            'X-Client-Token': this.token,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error:', error);
      throw new Error('Failed to create task note');
    }
  }

  public async cancelWithNote(checklistId: number, taskId: number, comment: string) {
    await this.createTaskNote(checklistId, taskId, comment);
    await this.changeTaskStatus(checklistId, taskId, "invalidate");
  }

  /**
   * Update the text of a note for a specific task in a checklist.
   * @param checklistId The ID of the checklist where the task exists.
   * @param taskId The ID of the task that contains the note.
   * @param noteId The ID of the note to update.
   * @param comment The updated text of the note.
   * @returns A Promise containing the updated note object in JSON format.
   */
  public async updateTaskNote(checklistId: number, taskId: number, noteId: number, comment: string): Promise<INote> {
    try {
      const url = `${this.apiBaseURL}/checklists/${checklistId}/tasks/${taskId}/comments/${noteId}.json`;
      const data = { comment };
      const response: AxiosResponse<INote> = await axios.put(url, data, {
        headers: {
            'X-Client-Token': this.token,
            'Content-Type': 'application/x-www-form-urlencoded',
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
  public async deleteTaskNote(checklistId: number, taskId: number, noteId: number): Promise<INote> {
    try {
      const url = `${this.apiBaseURL}/checklists/${checklistId}/tasks/${taskId}/comments/${noteId}.json`;
      const response: AxiosResponse<INote> = await axios.delete(url, {
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
  public async copyTaskWithChildren(checklistId: number, taskId: number, parent: ITask | null, tasks: ITask[] | null): Promise<number> {
    try {
      if (tasks === null) {
        tasks = await this.getChecklistTasks(checklistId, true, 'id:asc');
      }

      const taskToCopy: ITask | undefined = tasks.find((task) => task.id === taskId);
      if (taskToCopy === undefined) throw new Error(`Task ID not found: ${taskId}`);

      // Create a new task with updated due date (if in the past) and without the ID
      // in the same checklist
      const newTask: ITask = await this.createTask({
        checklist_id: checklistId,
        content: taskToCopy.content,
        parent_id: parent ? parent.id : taskToCopy.parent_id,
        tags: taskToCopy.tags_as_text,
        due_date: this.updateDueDate(taskToCopy.due),
        position: parent ? parent.tasks.length + 1 : taskToCopy.position + 1,
        status: 0, // even if the copied task is not open, the copied task must be
      });

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
  public async createTasks(parentTask: ITask, subtasks: string[]): Promise<ITask[]> {
    try {
      const startPosition: number = parentTask.tasks.length + 1;

      return await Promise.all(
        subtasks.map(async (subtaskContent, index) =>
          await this.createTask({
            checklist_id: parentTask.checklist_id,
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