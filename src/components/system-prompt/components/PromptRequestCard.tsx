import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Eye, Check, X, AlertCircle } from 'lucide-react';
import { PromptChangeRequest, PromptApproval } from '../types';
import { SECTION_TYPES } from '../constants';

interface PromptRequestCardProps {
  request: PromptChangeRequest;
  requestApprovals: PromptApproval[];
  userHasApproved: boolean;
  isOwnRequest: boolean;
  profile: any;
  loading: boolean;
  onApprove: (requestId: string, decision: 'approved' | 'rejected') => void;
}

export const PromptRequestCard = ({
  request,
  requestApprovals,
  userHasApproved,
  isOwnRequest,
  loading,
  onApprove
}: PromptRequestCardProps) => {
  const sectionInfo = SECTION_TYPES.find(t => t.value === request.section_type);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">
              {sectionInfo?.label || request.section_type} Change Request
            </CardTitle>
            <CardDescription>
              From {request.requester_profile?.full_name || request.requester_profile?.email} • 
              {requestApprovals.filter(a => a.decision === 'approved').length} of {request.required_approvals} approvals
            </CardDescription>
          </div>
          <Badge variant={requestApprovals.filter(a => a.decision === 'approved').length >= request.required_approvals ? "default" : "secondary"}>
            {request.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {request.justification && (
          <div>
            <h4 className="font-medium text-foreground mb-2">Justification:</h4>
            <p className="text-sm text-muted-foreground bg-muted p-3 rounded">
              {request.justification}
            </p>
          </div>
        )}

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full">
              <Eye className="w-4 h-4 mr-2" />
              View Changes
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>{sectionInfo?.label} Change Comparison</DialogTitle>
              <DialogDescription>
                Compare current content with proposed changes
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 max-h-[60vh] overflow-auto">
              <div>
                <h4 className="font-medium mb-2">Current Content</h4>
                <Textarea
                  value={request.current_content || '(Empty)'}
                  readOnly
                  className="min-h-[300px] text-xs bg-slate-50 text-slate-700 border-slate-200"
                />
              </div>
              <div>
                <h4 className="font-medium mb-2">Proposed Content</h4>
                <Textarea
                  value={request.proposed_content}
                  readOnly
                  className="min-h-[300px] text-xs bg-slate-50 text-slate-700 border-slate-200"
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {requestApprovals.length > 0 && (
          <div>
            <h4 className="font-medium text-foreground mb-2">Approvals:</h4>
            <div className="space-y-2">
              {requestApprovals.map((approval) => (
                <div key={approval.id} className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-600" />
                  <span>{approval.approver_profile?.full_name || approval.approver_profile?.email}</span>
                  <Badge variant="outline" className="text-xs">
                    {approval.decision}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isOwnRequest && !userHasApproved && (
          <div className="flex gap-2 pt-4 border-t">
            <Button
              onClick={() => onApprove(request.id, 'approved')}
              disabled={loading}
              className="flex-1"
            >
              <Check className="w-4 h-4 mr-2" />
              Approve
            </Button>
            <Button
              variant="destructive"
              onClick={() => onApprove(request.id, 'rejected')}
              disabled={loading}
              className="flex-1"
            >
              <X className="w-4 h-4 mr-2" />
              Reject
            </Button>
          </div>
        )}

        {isOwnRequest && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-blue-50 p-3 rounded">
            <AlertCircle className="w-4 h-4" />
            This is your request. Waiting for approval from other admins.
          </div>
        )}

        {userHasApproved && !isOwnRequest && (
          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded">
            <Check className="w-4 h-4" />
            You have already approved this request.
          </div>
        )}
      </CardContent>
    </Card>
  );
};