import axios, { AxiosResponse } from 'axios';

export interface MLContestResponse {
    name: string; // A description of the competition. 
    url: string; // Link to the competition. Feel free to insert codes so you can track the source.
    "type": string; // The type of ML that most closely matches the competition. See other competitions for examples. E.g. "✅ Supervised Learning"
    "tags": string[], // Any tags relevant to the type of challenge. E.g. ["supervised", "vision", "nlp"]
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