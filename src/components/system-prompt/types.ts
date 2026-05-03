export interface SystemPromptSection {
  id: string;
  content: string;
  version: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  section_type: string;
  section_order: number;
  section_title: string;
}

export interface PromptChangeRequest {
  id: string;
  proposed_content: string;
  current_content: string;
  requested_by: string;
  status: string;
  required_approvals: number;
  created_at: string;
  section_type: string;
  justification?: string;
  approved_at?: string;
  rejected_at?: string;
  updated_at: string;
  reason?: string;
  requester_profile?: any;
}

export interface PromptApproval {
  id: string;
  request_id: string;
  approved_by: string;
  decision: string;
  created_at: string;
  approver_profile?: any;
}

export interface SystemPromptManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface SectionType {
  value: string;
  label: string;
  order: number;
  description: string;
}