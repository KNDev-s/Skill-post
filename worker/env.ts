import type { D1Database, R2Bucket, Fetcher, BrowserRun } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  BROWSER: BrowserRun;
  APP_ORIGIN: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  INSTAGRAM_ACCESS_TOKEN: string;
  INSTAGRAM_ACCOUNT_ID: string;
  INSTAGRAM_API_HOST: string;
  META_API_VERSION: string;
  MEDIA_SIGNING_KEY: string;
  ENABLE_PUBLISHING: string;
}

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const conflict = () =>
  new AppError(409, 'CONFLICT', 'O post mudou. Atualize o status antes de continuar.');
