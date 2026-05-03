import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Trash2, Edit, UserPlus, Archive, Tag, Zap, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { BatchModeIndicator, RateLimitIndicator } from '@/components/ui/rate-limit-indicator';
import { BypassRequestDialog } from '@/components/crm/BypassRequestDialog';
import { useAuth } from '@/components/auth/AuthProvider';
import { behaviorTracker } from '@/lib/behaviorTracker';
import { rateLimitManager } from '@/lib/enhancedRateLimiting';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface BulkOperationsProps {
  selectedItems: string[];
  onClearSelection: () => void;
  onBulkDelete: (ids: string[]) => Promise<void>;
  onBulkUpdate?: (ids: string[], updates: any) => Promise<void>;
  entityType: 'contacts' | 'accounts' | 'deals' | 'activities' | 'tasks';
}

export const BulkOperations: React.FC<BulkOperationsProps> = ({
  selectedItems,
  onClearSelection,
  onBulkDelete,
  onBulkUpdate,
  entityType
}) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [bulkAction, setBulkAction] = useState<string>('');
  const [batchMode, setBatchMode] = useState<'responsive' | 'batch'>('responsive');
  const [showBypassDialog, setShowBypassDialog] = useState(false);
  const [rateLimitStatus, setRateLimitStatus] = useState<any>(null);

  // Get intelligent batch threshold
  const batchThreshold = user ? behaviorTracker.getBatchThreshold(user.id, 'member', {
    module: entityType,
    action: 'bulk_operation'
  }) : 20;

  if (selectedItems.length === 0) {
    return null;
  }

  const handleBulkDelete = async () => {
    if (!user) return;

    // Check rate limit before proceeding
    const limitCheck = await rateLimitManager.checkRateLimit(user.id, 'bulk_delete', {
      module: entityType,
      action: 'bulk_delete'
    });

    if (!limitCheck.allowed) {
      setRateLimitStatus(limitCheck);
      if (limitCheck.retryAfter) {
        setShowBypassDialog(true);
        return;
      }
    }

    setLoading(true);
    try {
      await onBulkDelete(selectedItems);
      onClearSelection();
      
      // Celebration toast
      toast({
        title: "✨ Success!",
        description: `${selectedItems.length} ${entityType} deleted in lightning speed!`
      });
    } catch (error: any) {
      const isRateLimit = error.message?.includes('rate') || error.message?.includes('too many');
      toast({
        title: isRateLimit ? "You're moving fast!" : "Error",
        description: isRateLimit 
          ? "Let's optimize this workflow. Consider using batch operations." 
          : error.message || `Failed to delete ${entityType}.`,
        variant: isRateLimit ? "default" : "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAction = async () => {
    if (!bulkAction || !onBulkUpdate) return;

    setLoading(true);
    try {
      let updates: any = {};
      
      switch (bulkAction) {
        case 'assign':
          // This would open a dialog to select assignee
          // For now, just show a placeholder
          toast({
            title: "Feature Coming Soon",
            description: "Bulk assignment feature will be available soon."
          });
          return;
        case 'tag':
          // This would open a dialog to select tags
          toast({
            title: "Feature Coming Soon", 
            description: "Bulk tagging feature will be available soon."
          });
          return;
        case 'archive':
          updates = { archived: true };
          break;
        default:
          return;
      }

      await onBulkUpdate(selectedItems, updates);
      onClearSelection();
      setBulkAction('');
      toast({
        title: "Success",
        description: `${selectedItems.length} ${entityType} updated successfully.`
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || `Failed to update ${entityType}.`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getEntityActions = () => {
    const commonActions = [
      { value: 'assign', label: 'Assign to User', icon: UserPlus },
      { value: 'tag', label: 'Add Tags', icon: Tag },
      { value: 'archive', label: 'Archive', icon: Archive }
    ];

    switch (entityType) {
      case 'contacts':
        return [
          ...commonActions,
          { value: 'export', label: 'Export to CSV', icon: Edit }
        ];
      case 'deals':
        return [
          ...commonActions,
          { value: 'stage', label: 'Update Stage', icon: Edit }
        ];
      default:
        return commonActions;
    }
  };

  const handleBypassRequest = async (reason: string, category: string) => {
    if (!user) return;
    
    await rateLimitManager.requestBypass(user.id, reason, {
      module: entityType,
      action: 'bulk_operation',
      isDemoMode: category === 'demo'
    });
  };

  return (
    <div className="space-y-4">
      {/* Rate Limit Indicator */}
      {rateLimitStatus && (
        <RateLimitIndicator
          current={rateLimitStatus.current}
          max={rateLimitStatus.max}
          willHitLimit={rateLimitStatus.willHitLimit}
          timeToLimit={rateLimitStatus.timeToLimit}
          suggestion={rateLimitStatus.suggestion}
          onRequestBypass={() => setShowBypassDialog(true)}
        />
      )}

      {/* Batch Mode Indicator */}
      <BatchModeIndicator
        selectedCount={selectedItems.length}
        threshold={batchThreshold}
        onToggleBatchMode={() => setBatchMode(prev => prev === 'responsive' ? 'batch' : 'responsive')}
        isBatchMode={batchMode === 'batch'}
      />

      <Card className="mb-4 border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{selectedItems.length}</Badge>
              {entityType} selected
            </div>
            <div className="flex items-center gap-2">
              {/* Batch Mode Toggle */}
              <ToggleGroup type="single" value={batchMode} onValueChange={(value) => value && setBatchMode(value as any)}>
                <ToggleGroupItem value="responsive" size="sm">
                  <Zap className="w-3 h-3 mr-1" />
                  Quick
                </ToggleGroupItem>
                <ToggleGroupItem value="batch" size="sm">
                  <Package className="w-3 h-3 mr-1" />
                  Batch
                </ToggleGroupItem>
              </ToggleGroup>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearSelection}
                className="h-6 px-2 text-xs"
              >
                Clear
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={bulkAction} onValueChange={setBulkAction}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Choose action" />
            </SelectTrigger>
            <SelectContent>
              {getEntityActions().map((action) => {
                const Icon = action.icon;
                return (
                  <SelectItem key={action.value} value={action.value}>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {action.label}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {bulkAction && (
            <Button
              onClick={handleBulkAction}
              disabled={loading}
              size="sm"
            >
              {loading ? 'Processing...' : 'Apply Action'}
            </Button>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                disabled={loading}
                className="ml-auto"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete Selected
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {selectedItems.length} {entityType}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the selected {entityType} 
                  and remove all associated data.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleBulkDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {loading ? 'Deleting...' : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>

    {/* Bypass Request Dialog */}
    <BypassRequestDialog
      open={showBypassDialog}
      onOpenChange={setShowBypassDialog}
      onSubmit={handleBypassRequest}
    />
    </div>
  );
};