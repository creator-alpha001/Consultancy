export type SessionStatus = 'scheduled' | 'in_progress' | 'completed' | 'no_show' | 'cancelled';
export type SessionMode = 'video' | 'audio_only';

export interface ScheduleSessionInput {
  engagementId: string;
  seekerId: string;
  providerId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  timezone: string;
}

export interface SessionRow {
  id: string;
  engagementId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  timezone: string;
  roomProvider: string | null;
  roomReference: string | null;
  mode: SessionMode;
  recordingActive: boolean;
  status: SessionStatus;
  startedAt: Date | null;
  endedAt: Date | null;
}

export interface TranscriptRow {
  id: string;
  sessionId: string;
  language: string;
  contentRef: string;
}
