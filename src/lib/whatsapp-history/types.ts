export type HistoryImportStatus =
  | 'uploading'
  | 'analyzing'
  | 'ready'
  | 'importing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface HistoryImportPreview {
  totalLineCount: number;
  validEventCount: number;
  invalidLineCount: number;
  skippedEventCount: number;
  messageCount: number;
  chatCount: number;
  inboundCount: number;
  outboundCount: number;
  mediaCount: number;
  duplicateEventIdCount: number;
  truncatedTextCount: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
  issues: Array<{
    line: number;
    code: string;
    message: string;
  }>;
}

export interface NormalizedHistoryMessage {
  phone: string;
  name: string | null;
  chatId: string;
  messageKey: string;
  timestamp: string;
  senderType: 'customer' | 'agent';
  contentType:
    | 'text'
    | 'image'
    | 'document'
    | 'audio'
    | 'video'
    | 'location'
    | 'template'
    | 'interactive';
  contentText: string;
  sourceLine: number;
  providerMetadata: {
    chat_id: string;
    original_event_id: string | null;
    original_key_id: string | null;
    original_message_type: number | null;
    media_reference?: string;
  };
}

export interface NormalizedHistoryContact {
  phone: string;
  name: string | null;
  chatId: string;
  originatedAt: string | null;
}

export interface ParsedHistoryJsonl {
  preview: HistoryImportPreview;
  contacts: NormalizedHistoryContact[];
  messages: NormalizedHistoryMessage[];
}

export interface HistoryImportBatch {
  id: string;
  status: HistoryImportStatus;
  original_filename: string;
  size_bytes: number;
  checksum_sha256: string;
  total_line_count: number;
  valid_event_count: number;
  invalid_line_count: number;
  skipped_event_count: number;
  message_count: number;
  chat_count: number;
  inbound_count: number;
  outbound_count: number;
  media_count: number;
  duplicate_event_id_count: number;
  import_cursor: number;
  imported_message_count: number;
  duplicate_message_count: number;
  preview: HistoryImportPreview | Record<string, never>;
  report: Record<string, unknown>;
  error_message: string | null;
  analyzed_at: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
