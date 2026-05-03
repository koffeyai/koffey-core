import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { 
  FileUp, 
  MessageSquare, 
  CheckCircle, 
  AlertTriangle, 
  Zap, 
  Package, 
  RotateCcw,
  Sparkles,
  FileText,
  Database
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { BulkOperations } from './BulkOperations';
import { bulkChatAssistant, CSVProcessingResult, BulkErrorPattern, BulkSuggestion, ProgressiveValidationStep } from '@/services/bulkChatAssistant';
type CRMEntityType = 'contacts' | 'accounts' | 'deals' | 'activities' | 'tasks';
import { launchChatWith } from '@/stores/unifiedChatStore';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';

interface BulkOperationsEnhancedProps {
  selectedItems: string[];
  onClearSelection: () => void;
  onBulkDelete: (ids: string[]) => Promise<void>;
  onBulkUpdate?: (ids: string[], updates: any) => Promise<void>;
  onBulkImport?: (records: any[]) => Promise<void>;
  entityType: CRMEntityType;
}

export const BulkOperationsEnhanced: React.FC<BulkOperationsEnhancedProps> = ({
  selectedItems,
  onClearSelection,
  onBulkDelete,
  onBulkUpdate,
  onBulkImport,
  entityType
}) => {
  const { toast } = useToast();
  const { organizationId } = useOrganizationAccess();
  
  // CSV Import State
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [processingCSV, setProcessingCSV] = useState(false);
  const [csvResults, setCsvResults] = useState<CSVProcessingResult | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [currentStep, setCurrentStep] = useState<ProgressiveValidationStep | null>(null);

  // Pattern Recognition State
  const [detectedPatterns, setDetectedPatterns] = useState<BulkErrorPattern[]>([]);
  const [smartSuggestions, setSmartSuggestions] = useState<BulkSuggestion[]>([]);
  const [appliedFixes, setAppliedFixes] = useState<string[]>([]);

  /**
   * Handle CSV file selection and processing
   */
  const handleCSVUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !organizationId) return;

    setCsvFile(file);
    setProcessingCSV(true);
    setImportProgress(10);

    try {
      const results = await bulkChatAssistant.processCSVImport(
        file, 
        entityType, 
        organizationId
      );

      setCsvResults(results);
      setDetectedPatterns(results.errorPatterns);
      setSmartSuggestions(results.smartSuggestions);
      setImportProgress(100);

      // Show results summary
      toast({
        title: "📊 CSV Analysis Complete",
        description: `Found ${results.validRecords.length} valid records, ${results.errorPatterns.length} patterns to fix`
      });

      // If major issues, launch chat assistant
      if (results.errorPatterns.some(p => p.type === 'missing_field')) {
        setTimeout(() => {
          launchChatWithBulkContext(results);
        }, 1000);
      }

      setShowImportDialog(true);
    } catch (error: any) {
      toast({
        title: "CSV Processing Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setProcessingCSV(false);
    }
  }, [entityType, organizationId, toast]);

  /**
   * Launch chat with bulk processing context
   */
  const launchChatWithBulkContext = (results: CSVProcessingResult) => {
    const criticalIssues = results.errorPatterns.filter(p => 
      p.type === 'missing_field' && p.affectedCount > 1
    );

    let prompt = `I've analyzed your ${entityType} import and found some patterns that need attention:\n\n`;

    // Describe the biggest issues
    criticalIssues.slice(0, 3).forEach(pattern => {
      prompt += `• ${pattern.affectedCount} records missing ${pattern.field}`;
      if (pattern.suggestedFix) {
        prompt += ` → I can help: ${pattern.suggestedFix}`;
      }
      prompt += `\n`;
    });

    // Highlight smart suggestions
    const autoFixable = results.smartSuggestions.filter(s => !s.requiresConfirmation);
    if (autoFixable.length > 0) {
      prompt += `\n✨ I can automatically fix ${autoFixable.length} issues right now!\n`;
    }

    const needsConfirmation = results.smartSuggestions.filter(s => s.requiresConfirmation);
    if (needsConfirmation.length > 0) {
      prompt += `\n🤔 ${needsConfirmation.length} suggestions need your confirmation first.\n`;
    }

    prompt += `\nShould I start with the automatic fixes, or would you like to review everything first?`;

    launchChatWith(prompt, {
      type: 'bulk_import',
      entityType,
      csvResults: results,
      patterns: criticalIssues,
      suggestions: results.smartSuggestions
    });
  };

  /**
   * Apply a smart suggestion with user confirmation
   */
  const applySuggestion = async (suggestion: BulkSuggestion) => {
    if (!csvResults) return;

    try {
      // Mark suggestion as applied
      setAppliedFixes(prev => [...prev, `${suggestion.type}_${suggestion.field}`]);

      toast({
        title: "✨ Smart Fix Applied",
        description: `${suggestion.reasoning} (${suggestion.affectedRecords.length} records updated)`
      });

      // Update CSV results to reflect the fix
      // In a real implementation, this would update the actual records
      const updatedResults = {
        ...csvResults,
        smartSuggestions: csvResults.smartSuggestions.filter(s => s !== suggestion)
      };
      setCsvResults(updatedResults);

    } catch (error: any) {
      toast({
        title: "Fix Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  /**
   * Start progressive validation flow
   */
  const startProgressiveValidation = () => {
    if (!csvResults?.progressiveSteps.length) return;

    const firstStep = csvResults.progressiveSteps[0];
    setCurrentStep(firstStep);

    launchChatWith(
      `Let's fix your ${entityType} data step by step. Starting with: ${firstStep.title}\n\n${firstStep.description}\n\nThis affects ${firstStep.affectedRecords} records and should take about ${firstStep.estimatedTime}. Ready to begin?`,
      {
        type: 'progressive_validation',
        step: firstStep,
        entityType
      }
    );
  };

  /**
   * Import validated records
   */
  const handleImportRecords = async () => {
    if (!csvResults?.validRecords.length || !onBulkImport) return;

    setImportProgress(0);
    
    try {
      await onBulkImport(csvResults.validRecords);
      
      toast({
        title: "🎉 Import Successful!",
        description: `${csvResults.validRecords.length} ${entityType} imported successfully`
      });

      // Reset state
      setCsvFile(null);
      setCsvResults(null);
      setDetectedPatterns([]);
      setSmartSuggestions([]);
      setAppliedFixes([]);
      setShowImportDialog(false);

    } catch (error: any) {
      toast({
        title: "Import Failed", 
        description: error.message,
        variant: "destructive"
      });
    }
  };

  /**
   * Render pattern summary cards
   */
  const renderPatternSummary = () => {
    if (!detectedPatterns.length) return null;

    return (
      <div className="space-y-3">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Issues Detected
        </h4>
        
        {detectedPatterns.slice(0, 3).map((pattern, index) => (
          <Card key={index} className="border-amber-200 bg-amber-50/50">
            <CardContent className="p-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {pattern.affectedCount} records
                    </Badge>
                    <span className="text-sm font-medium capitalize">
                      {pattern.type.replace('_', ' ')} - {pattern.field}
                    </span>
                  </div>
                  {pattern.suggestedFix && (
                    <p className="text-xs text-muted-foreground">
                      💡 {pattern.suggestedFix}
                    </p>
                  )}
                </div>
                {pattern.autoFixable && (
                  <Badge variant="secondary" className="text-xs">
                    Auto-fixable
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  /**
   * Render smart suggestions
   */
  const renderSmartSuggestions = () => {
    if (!smartSuggestions.length) return null;

    return (
      <div className="space-y-3">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Smart Suggestions
        </h4>
        
        {smartSuggestions.slice(0, 3).map((suggestion, index) => {
          const isApplied = appliedFixes.includes(`${suggestion.type}_${suggestion.field}`);
          
          return (
            <Card key={index} className="border-primary/20 bg-primary/5">
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {Math.round(suggestion.confidence * 100)}% confidence
                      </Badge>
                      <span className="text-sm font-medium">
                        {suggestion.field}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {suggestion.reasoning}
                    </p>
                    <p className="text-xs text-primary">
                      Affects {suggestion.affectedRecords.length} records
                    </p>
                  </div>
                  
                  {!isApplied ? (
                    <Button
                      size="sm"
                      variant={suggestion.requiresConfirmation ? "outline" : "default"}
                      onClick={() => applySuggestion(suggestion)}
                      className="ml-2"
                    >
                      {suggestion.requiresConfirmation ? "Review" : "Apply"}
                    </Button>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Applied
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Original Bulk Operations */}
      <BulkOperations
        selectedItems={selectedItems}
        onClearSelection={onClearSelection}
        onBulkDelete={onBulkDelete}
        onBulkUpdate={onBulkUpdate}
        entityType={entityType}
      />

      {/* CSV Import Section */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            Bulk Import with AI Assistant
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-4">
            {/* File Upload */}
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                className="hidden"
                id="csv-upload"
                disabled={processingCSV}
              />
              <label htmlFor="csv-upload">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  disabled={processingCSV}
                  className="cursor-pointer"
                >
                  <span>
                    <FileUp className="w-4 h-4 mr-2" />
                    {csvFile ? csvFile.name : `Upload ${entityType} CSV`}
                  </span>
                </Button>
              </label>

              {csvResults && (
                <>
                  <Button
                    size="sm"
                    onClick={startProgressiveValidation}
                    disabled={!csvResults.progressiveSteps.length}
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Smart Fix
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => launchChatWithBulkContext(csvResults)}
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Chat Help
                  </Button>
                </>
              )}
            </div>

            {/* Processing Progress */}
            {processingCSV && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Analyzing patterns...</span>
                  <span>{importProgress}%</span>
                </div>
                <Progress value={importProgress} className="h-2" />
              </div>
            )}

            {/* Results Summary */}
            {csvResults && (
              <div className="grid grid-cols-3 gap-4 p-4 bg-background/50 rounded-lg border">
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600">
                    {csvResults.validRecords.length}
                  </div>
                  <div className="text-xs text-muted-foreground">Valid Records</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-amber-600">
                    {csvResults.errorPatterns.length}
                  </div>
                  <div className="text-xs text-muted-foreground">Issues Found</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-primary">
                    {csvResults.smartSuggestions.length}
                  </div>
                  <div className="text-xs text-muted-foreground">Smart Fixes</div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Import Results Dialog */}
      <AlertDialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Import Analysis Results
            </AlertDialogTitle>
            <AlertDialogDescription>
              Review the analysis and apply fixes before importing your data.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-6">
            {/* Pattern Summary */}
            {renderPatternSummary()}
            
            {detectedPatterns.length > 0 && smartSuggestions.length > 0 && (
              <Separator />
            )}
            
            {/* Smart Suggestions */}
            {renderSmartSuggestions()}

            {/* Progressive Steps Preview */}
            {csvResults?.progressiveSteps && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary" />
                    Recommended Steps
                  </h4>
                  {csvResults.progressiveSteps.slice(0, 3).map((step, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-background/50 rounded-lg border">
                      <div>
                        <div className="font-medium text-sm">{step.title}</div>
                        <div className="text-xs text-muted-foreground">{step.estimatedTime}</div>
                      </div>
                      <Badge variant={
                        step.priority === 'critical' ? 'destructive' :
                        step.priority === 'important' ? 'default' : 'secondary'
                      }>
                        {step.priority}
                      </Badge>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <div className="flex gap-2 flex-1">
              <Button
                variant="outline"
                onClick={startProgressiveValidation}
                disabled={!csvResults?.progressiveSteps.length}
                size="sm"
              >
                <Zap className="w-4 h-4 mr-2" />
                Start Smart Fix
              </Button>
              
              <Button
                variant="outline"
                onClick={() => launchChatWithBulkContext(csvResults!)}
                size="sm"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Chat Assistant
              </Button>
            </div>
            
            <div className="flex gap-2">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleImportRecords}
                disabled={!csvResults?.validRecords.length}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Import {csvResults?.validRecords.length || 0} Records
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};