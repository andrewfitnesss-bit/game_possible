import type { MeetingResult } from '../../lib/types';

// Действия стола. Каждое возвращает true при успехе; ошибки показываются тостом в TeamWorkspace.
export interface WorkspaceActions {
  createPurchase: (item: string, targets: string[], justification: string, requestId: number | null) => Promise<boolean>;
  decidePurchase: (id: number, approve: boolean, note: string) => Promise<boolean>;
  cancelPurchase: (id: number, note: string) => Promise<boolean>;
  createHqRequest: (title: string, barrier: string, targets: string[], priority: number) => Promise<boolean>;
  priceHqRequest: (id: number, price: number | null) => Promise<boolean>;
  deleteHqRequest: (id: number) => Promise<boolean>;
  saveMeeting: (r: Omit<MeetingResult, 'team_id'>) => Promise<boolean>;
  deleteMeeting: (client: string) => Promise<boolean>;
}
