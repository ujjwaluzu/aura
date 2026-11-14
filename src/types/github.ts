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
  account: { accountId: string; login: string } | null;
  workPermission: boolean;
  work: GithubWorkCategoryState[];
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

export type GithubWorkCategory = 'reviews' | 'myPrs' | 'failingPrs' | 'issues';
export interface GithubWorkItem {
  id: string;
  title: string;
  repository: string;
  number: number;
  updatedAt: string;
  draft: boolean;
  reviewDecision: string | null;
  checks: string | null;
  private: boolean;
}
export interface GithubWorkCategoryState {
  category: GithubWorkCategory;
  status: 'loading' | 'ready' | 'empty' | 'permission' | 'error';
  count: number | null;
  items: GithubWorkItem[];
  cursor: string | null;
  hasNextPage: boolean;
  limited: boolean;
  loading: boolean;
  stale: boolean;
  updatedAt: number | null;
  message: string | null;
}
