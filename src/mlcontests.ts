import axios, { AxiosResponse } from 'axios';
import moment from 'moment';
import { Session, ITask } from './checkvist';

export interface MLContestResponse {
    name: string; // A description of the competition. 
    url: string; // Link to the competition. Feel free to insert codes so you can track the source.
    type: string; // The type of ML that most closely matches the competition. See other competitions for examples. E.g. "✅ Supervised Learning"
    tags: string[], // Any tags relevant to the type of challenge. E.g. ["supervised", "vision", "nlp"]
    additional_urls: string[]; // Any additional relevant links - for example, to the competition homepage if the actual competition is run on CodaLab. E.g. ["https://example1.com", "https://example2.com"]
    launched: string | null; // day the competition starts. Format is "D MMM YYYY".
    "registration-deadline": string | null; // final day new competitors are able to register. Format is "D MMM YYYY".
    deadline: string; // final day for submissions. Format is "D MMM YYYY".
    prize: string; // Monetary prizes only, converted to USD, or leave blank.
    platform: string; // which platform is running the competition? E.g. "Kaggle"/"DrivenData"
    sponsor: string; // Who's providing sponsorship? E.g. "Google"
    conference: string | null; // Any conference affiliation, e.g. "NeurIPS"
    "conference-year": number | null; // Which year of the conference is this competition affiliated with? E.g. 2022
    "data-size"?: number;
}

export interface MLContestsResponse {
    data: MLContestResponse[];
}

export async function mlContests(): Promise<MLContestsResponse> {
    const response: AxiosResponse<MLContestsResponse> = await axios.get("https://raw.githubusercontent.com/mlcontests/mlcontests.github.io/master/competitions.json");
    return response.data;
}

export function parseDate(date: string) {
    return moment(date, "DD MMM YYYY");
}

export function canRegister(mlc: MLContestResponse, now: moment.Moment | undefined = undefined) {
    now = now || moment();
    return parseDate(mlc.deadline).diff(now, 'days') >= 0;
}

export async function createTasks(session: Session, parentTask: ITask, initialTasks: string[], mlcs: MLContestResponse[]) {
    for (const mlc of mlcs) {
        const created = await session.createTask({
            checklist_id: parentTask.checklist_id,
            parent_id: parentTask.id,
            content: mlc.url.split(/[?#]/)[0],
            tags: [mlc.type].concat(mlc.tags),
            due_date: parseDate(mlc.deadline).toDate(),
        });
        if (mlc['registration-deadline'] && mlc['registration-deadline'] != mlc.deadline) {
            await session.createTask({
                checklist_id: parentTask.checklist_id,
                parent_id: created.id,
                content: 'register',
                due_date: parseDate(mlc['registration-deadline']).toDate(),
            });
        }
        await session.createTasks(created, initialTasks);
    }
}