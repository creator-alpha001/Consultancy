export interface AgendaItemInput {
  labelLang: string;
  labelText: string;
  translations?: Record<string, string>;
}

export interface CreateAgendaInput {
  engagementId: string;
  originalLang: string;
  expectedDeliverable: string;
  outOfScope?: string;
  successCriteria: string;
  context?: string;
  items: AgendaItemInput[];
}

export interface AgendaItemRow {
  id: string;
  ordinal: number;
  labelLang: string;
  labelText: string;
  translations: Record<string, string>;
  checkedAt: Date | null;
}

export interface AgendaRow {
  id: string;
  engagementId: string;
  version: number;
  originalLang: string;
  expectedDeliverable: string;
  outOfScope: string;
  successCriteria: string;
  context: string;
  lockedAt: Date | null;
  lockedHash: string | null;
  supersededAt: Date | null;
  items: AgendaItemRow[];
}
