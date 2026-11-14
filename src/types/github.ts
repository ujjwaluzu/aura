export type ContributionLevel =
  | 'NONE'
  | 'FIRST_QUARTILE'
  | 'SECOND_QUARTILE'
  | 'THIRD_QUARTILE'
  | 'FOURTH_QUARTILE';
export interface ContributionDay {
  date: string;
  contributionCount: number;
  contributionLevel: ContributionLevel;
  weekday: number;
}
export interface GithubCalendar {
  accountId: string;
  login: string;
  totalContributions: number;
  weeks: { contributionDays: ContributionDay[] }[];
  updatedAt: number;
}
export interface GithubState {
  revision: number;
  status:
    | 'unavailable'
    | 'disconnected'
    | 'requesting'
    | 'authorizing'
    | 'connected'
    | 'failed'
    | 'reconnectRequired';
  configured: boolean;
  refreshing: boolean;
  stale: boolean;
  calendar: GithubCalendar | null;
  authorization: { userCode: string; expiresAt: number } | null;
  message: string | null;
  retryAt: number | null;
}
export type GithubDestination = 'verification' | 'profile' | 'authorization';
