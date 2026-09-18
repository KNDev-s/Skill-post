import type {
  GeneratePostRequest,
  Post,
  RevisionRequest,
  SchedulePostRequest,
  UpdateCaptionRequest,
} from '../types/post';

export interface PostService {
  generatePost(request: GeneratePostRequest): Promise<Post>;
  getPost(id: string): Promise<Post>;
  regeneratePost(id: string, request: RevisionRequest): Promise<Post>;
  regenerateSlide(id: string, slideId: string, request: RevisionRequest): Promise<Post>;
  updateCaption(id: string, request: UpdateCaptionRequest): Promise<Post>;
  approvePost(id: string, request: RevisionRequest): Promise<Post>;
  publishPost(id: string, request: RevisionRequest): Promise<Post>;
  schedulePost(id: string, request: SchedulePostRequest): Promise<Post>;
}
export class ServiceError extends Error {
  constructor(
    message: string,
    public code = 'UNKNOWN',
    public status?: number,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}
