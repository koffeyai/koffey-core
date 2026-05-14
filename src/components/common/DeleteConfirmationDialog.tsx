import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Trash2, Info } from 'lucide-react';

interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  title: string;
  description: string;
  entityName?: string;
  entityType: 'contact' | 'deal' | 'account' | 'activity' | 'task';
  requireConfirmation?: boolean;
  showRelatedWarning?: boolean;
  relatedItems?: string[];
  loading?: boolean;
  confirmLabel?: string;
}

export const DeleteConfirmationDialog: React.FC<DeleteConfirmationDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  entityName,
  entityType,
  requireConfirmation = false,
  showRelatedWarning = false,
  relatedItems = [],
  loading = false,
  confirmLabel
}) => {
  const [confirmationText, setConfirmationText] = useState('');
  const [acknowledgeWarning, setAcknowledgeWarning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    if (requireConfirmation && confirmationText.toLowerCase() !== 'delete') {
      return;
    }
    
    if (showRelatedWarning && !acknowledgeWarning) {
      return;
    }

    setIsDeleting(true);
    try {
      await onConfirm();
      onOpenChange(false);
      // Reset form state
      setConfirmationText('');
      setAcknowledgeWarning(false);
    } catch (error) {
      // Error is handled by the parent component
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    setConfirmationText('');
    setAcknowledgeWarning(false);
  };

  const isConfirmationValid = !requireConfirmation || confirmationText.toLowerCase() === 'delete';
  const isWarningAcknowledged = !showRelatedWarning || acknowledgeWarning;
  const canConfirm = isConfirmationValid && isWarningAcknowledged && !isDeleting;

  const getEntityIcon = () => {
    switch (entityType) {
      case 'contact':
        return '👤';
      case 'deal':
        return '💼';
      case 'account':
        return '🏢';
      case 'activity':
        return '📅';
      case 'task':
        return '✅';
      default:
        return '📄';
    }
  };

  const getEntityColor = () => {
    switch (entityType) {
      case 'contact':
        return 'text-blue-600';
      case 'deal':
        return 'text-green-600';
      case 'account':
        return 'text-purple-600';
      case 'activity':
        return 'text-orange-600';
      case 'task':
        return 'text-yellow-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <div className="text-lg font-semibold text-gray-900">{title}</div>
              {entityName && (
                <div className={`text-sm font-medium ${getEntityColor()}`}>
                  {getEntityIcon()} {entityName}
                </div>
              )}
            </div>
          </AlertDialogTitle>
        </AlertDialogHeader>
        
        <AlertDialogDescription className="space-y-4">
          <p className="text-gray-600">{description}</p>
          
          {showRelatedWarning && relatedItems.length > 0 && (
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-yellow-800">
                    Warning: This action will affect related items
                  </p>
                  <ul className="text-sm text-yellow-700 space-y-1">
                    {relatedItems.slice(0, 3).map((item, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-yellow-600 rounded-full"></span>
                        {item}
                      </li>
                    ))}
                    {relatedItems.length > 3 && (
                      <li className="text-xs text-yellow-600">
                        ...and {relatedItems.length - 3} more items
                      </li>
                    )}
                  </ul>
                  
                  <div className="flex items-center space-x-2 mt-3">
                    <Checkbox
                      id="acknowledge-warning"
                      checked={acknowledgeWarning}
                      onCheckedChange={(checked) => setAcknowledgeWarning(checked === true)}
                    />
                    <Label 
                      htmlFor="acknowledge-warning" 
                      className="text-sm text-yellow-800 cursor-pointer"
                    >
                      I understand the impact and want to proceed
                    </Label>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {requireConfirmation && (
            <div className="space-y-3">
              <div className="bg-gray-50 p-4 rounded-lg border">
                <p className="text-sm font-medium text-gray-900 mb-2">
                  This action cannot be undone. To confirm, type <code className="bg-gray-200 px-2 py-1 rounded text-red-600 font-mono">delete</code> below:
                </p>
                <Input
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  placeholder="Type 'delete' to confirm"
                  className={`text-center font-mono ${
                    confirmationText && !isConfirmationValid 
                      ? 'border-red-500 bg-red-50' 
                      : isConfirmationValid 
                      ? 'border-green-500 bg-green-50' 
                      : ''
                  }`}
                />
                {confirmationText && !isConfirmationValid && (
                  <p className="text-xs text-red-600 mt-1">
                    Please type "delete" exactly as shown
                  </p>
                )}
              </div>
            </div>
          )}
        </AlertDialogDescription>

        <AlertDialogFooter className="gap-3">
          <AlertDialogCancel onClick={handleCancel} disabled={isDeleting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`bg-red-600 hover:bg-red-700 focus:ring-red-500 ${
              !canConfirm ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isDeleting ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Deleting...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Trash2 className="h-4 w-4" />
                {confirmLabel ?? `Delete ${entityType}`}
              </div>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
