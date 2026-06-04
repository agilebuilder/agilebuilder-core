export type PlanType = 'free' | 'trial' | 'pro';

export interface WorkspaceInfo {
  id: string;
  name: string;
  type: 'local' | 'personal' | 'team';
  plan: PlanType;
  features: string[];
}

export interface CurrentWorkspace {
  id: string;
  selectedAt: string;
}
