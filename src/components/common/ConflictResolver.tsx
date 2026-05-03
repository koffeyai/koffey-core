import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Users, Clock } from 'lucide-react';

interface ConflictResolverProps {
  conflicts: Array<{
    entityId: string;
    localChanges: any;
    remoteChanges: any;
  }>;
  onResolve: (entityId: string, resolution: any) => void;
  onDismiss: (entityId: string) => void;
}

export const ConflictResolver: React.FC<ConflictResolverProps> = ({
  conflicts,
  onResolve,
  onDismiss
}) => {
  const [selectedConflict, setSelectedConflict] = React.useState<any>(null);

  if (conflicts.length === 0) return null;

  const currentConflict = selectedConflict || conflicts[0];

  const getFieldDifferences = (local: any, remote: any) => {
    const differences: Array<{
      field: string;
      localValue: any;
      remoteValue: any;
      isDifferent: boolean;
    }> = [];

    const allFields = new Set([...Object.keys(local), ...Object.keys(remote)]);
    const excludeFields = ['id', 'created_at', 'updated_at'];

    allFields.forEach(field => {
      if (excludeFields.includes(field)) return;

      const localValue = local[field];
      const remoteValue = remote[field];
      const isDifferent = localValue !== remoteValue;

      differences.push({
        field,
        localValue,
        remoteValue,
        isDifferent
      });
    });

    return differences.filter(d => d.isDifferent);
  };

  const handleMergeField = (field: string, useLocal: boolean) => {
    const merged = {
      ...currentConflict.remoteChanges,
      [field]: useLocal ? currentConflict.localChanges[field] : currentConflict.remoteChanges[field],
      updated_at: new Date().toISOString()
    };

    onResolve(currentConflict.entityId, merged);
  };

  const handleUseVersion = (useLocal: boolean) => {
    const resolution = useLocal ? 
      { ...currentConflict.localChanges, updated_at: new Date().toISOString() } :
      currentConflict.remoteChanges;

    onResolve(currentConflict.entityId, resolution);
  };

  const differences = getFieldDifferences(
    currentConflict.localChanges,
    currentConflict.remoteChanges
  );

  return (
    <Dialog open={true} onOpenChange={() => onDismiss(currentConflict.entityId)}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-orange-600" />
            Conflict Resolution Required
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* CONFLICT SUMMARY */}
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertDescription>
              This record was modified by multiple users at the same time. 
              Please choose how to resolve the conflicts below.
            </AlertDescription>
          </Alert>

          {/* MULTIPLE CONFLICTS INDICATOR */}
          {conflicts.length > 1 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {conflicts.length} conflicts pending
              </Badge>
              <span className="text-sm text-muted-foreground">
                Resolving conflict {conflicts.findIndex(c => c.entityId === currentConflict.entityId) + 1} of {conflicts.length}
              </span>
            </div>
          )}

          {/* QUICK RESOLUTION */}
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => handleUseVersion(true)}
              className="flex-1"
            >
              Use My Changes
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handleUseVersion(false)}
              className="flex-1"
            >
              Use Their Changes
            </Button>
          </div>

          {/* FIELD-BY-FIELD RESOLUTION */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Field-by-Field Resolution</h3>
            <div className="space-y-4">
              {differences.map(({ field, localValue, remoteValue }) => (
                <Card key={field}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base capitalize">
                      {field.replace(/_/g, ' ')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      {/* LOCAL VERSION */}
                      <Card className="border-blue-200">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm text-blue-700">
                            Your Version
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-2">
                          <div className="text-sm mb-3 font-mono bg-blue-50 p-2 rounded">
                            {typeof localValue === 'object' ? 
                              JSON.stringify(localValue, null, 2) : 
                              String(localValue || '(empty)')
                            }
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMergeField(field, true)}
                            className="w-full border-blue-300 text-blue-700 hover:bg-blue-50"
                          >
                            Use This Value
                          </Button>
                        </CardContent>
                      </Card>

                      {/* REMOTE VERSION */}
                      <Card className="border-orange-200">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm text-orange-700">
                            Their Version
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-2">
                          <div className="text-sm mb-3 font-mono bg-orange-50 p-2 rounded">
                            {typeof remoteValue === 'object' ? 
                              JSON.stringify(remoteValue, null, 2) : 
                              String(remoteValue || '(empty)')
                            }
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMergeField(field, false)}
                            className="w-full border-orange-300 text-orange-700 hover:bg-orange-50"
                          >
                            Use This Value
                          </Button>
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => onDismiss(currentConflict.entityId)}
            >
              Resolve Later
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};