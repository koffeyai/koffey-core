import React, { useState, useEffect } from 'react';
import { useAdminJobs } from '@/hooks/useAdminJobs';
import { LiveStatusCard } from './LiveStatusCard';
import { enhancedCrmOperationsService } from '@/services/enhancedCrmOperationsService';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';

interface JobAwareChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  liveStatus?: {
    jobId: string;
    type: 'progress' | 'completed' | 'failed';
    estimatedTime?: number;
  };
  timestamp: Date;
}

interface JobAwareChatProps {
  messages: JobAwareChatMessage[];
  onSendMessage: (message: string) => void;
  onJobTriggered?: (jobId: string, command: string) => void;
}

export const JobAwareChat: React.FC<JobAwareChatProps> = ({
  messages,
  onSendMessage,
  onJobTriggered
}) => {
  const { createJob, createNotification, updateJobProgress, completeJob } = useAdminJobs();
  const { organizationId } = useOrganizationAccess();
  const [activeJobIds, setActiveJobIds] = useState<Set<string>>(new Set());

  // Handle job-triggering commands
  const handleSendMessage = async (message: string) => {
    onSendMessage(message);

    // Check if message contains job-triggering commands
    const jobCommands = [
      { pattern: /merge duplicates?/i, type: 'duplicate_detection' },
      { pattern: /scan (data )?quality/i, type: 'data_quality_scan' },
      { pattern: /analyze pipeline/i, type: 'pipeline_analysis' },
      { pattern: /export (data|contacts|deals)/i, type: 'data_export' },
      { pattern: /run nightly scan/i, type: 'nightly_scan' },
      { pattern: /bulk (update|merge|import)/i, type: 'bulk_operation' }
    ];

    for (const command of jobCommands) {
      if (command.pattern.test(message)) {
        const jobId = await createJob(command.type, 2, 30); // High priority, 30min timeout
        
        if (jobId && organizationId) {
          setActiveJobIds(prev => new Set(prev).add(jobId));
          onJobTriggered?.(jobId, command.type);

          // Create notification for job start
          await createNotification(
            'info',
            `${command.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Started`,
            `Your ${command.type.replace(/_/g, ' ')} operation has been queued and will start shortly.`,
            {
              jobId,
              actionLabel: 'View Progress',
              actionData: { type: 'view_job_progress', jobId }
            }
          );

          // Execute the actual CRM operation in the background
          executeBackgroundOperation(jobId, command.type, organizationId);
        }
        break;
      }
    }
  };

  // Execute background CRM operations with progress tracking
  const executeBackgroundOperation = async (jobId: string, operationType: string, organizationId: string) => {
    try {
      await updateJobProgress(jobId, 'starting', 5, 'Initializing operation...');

      let result: any;
      
      switch (operationType) {
        case 'duplicate_detection':
          result = await enhancedCrmOperationsService.detectDuplicates(
            organizationId,
            0.8,
            (stage, progress) => updateJobProgress(jobId, stage, progress)
          );
          break;

        case 'data_quality_scan':
          result = await enhancedCrmOperationsService.scanDataQuality(
            organizationId,
            (stage, progress) => updateJobProgress(jobId, stage, progress)
          );
          break;

        case 'pipeline_analysis':
          result = await enhancedCrmOperationsService.analyzePipeline(
            organizationId,
            (stage, progress) => updateJobProgress(jobId, stage, progress)
          );
          break;

        case 'bulk_operation':
          result = await enhancedCrmOperationsService.executeBulkOperation(
            'fix_data_quality',
            organizationId,
            { fixes: [] },
            (stage, progress) => updateJobProgress(jobId, stage, progress)
          );
          break;

        default:
          throw new Error(`Unsupported operation: ${operationType}`);
      }

      // Complete the job with results
      await completeJob(jobId, 'completed', {
        ...result,
        suggestions_generated: result.merge_suggestions?.length || result.recommendations?.length || result.actionable_recommendations?.length || 0,
        data_quality_score: result.overall_score || result.health_score || 85,
        pipeline_health_score: result.health_score || 90,
        scan_duration_ms: result.execution_time_ms || 2000
      });

      // Create success notification
      await createNotification(
        'success',
        `${operationType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Complete`,
        `Operation completed successfully. ${result.merge_suggestions?.length || result.recommendations?.length || 0} recommendations generated.`,
        {
          jobId,
          actionLabel: 'View Results',
          actionData: { type: 'view_results', jobId, results: result }
        }
      );

    } catch (error) {
      console.error(`Background operation ${operationType} failed:`, error);
      
      await completeJob(jobId, 'failed', {}, {
        error_message: error instanceof Error ? error.message : 'Operation failed',
        stage_failed: 'execution',
        timestamp: Date.now()
      });

      await createNotification(
        'error',
        `${operationType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Failed`,
        `Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          jobId,
          actionLabel: 'Retry',
          actionData: { type: 'retry_operation', jobId, operationType }
        }
      );
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-sm lg:max-w-md xl:max-w-lg space-y-2`}>
              {/* Message Bubble */}
              <div className={`
                px-4 py-2 rounded-lg
                ${message.type === 'user' 
                  ? 'bg-primary text-primary-foreground ml-4' 
                  : 'bg-muted mr-4'
                }
              `}>
                {message.content}
              </div>
              
              {/* Live Status Card */}
              {message.liveStatus && (
                <div className="mt-2">
                  <LiveStatusCard
                    jobId={message.liveStatus.jobId}
                    onCancel={() => {
                      setActiveJobIds(prev => {
                        const newSet = new Set(prev);
                        newSet.delete(message.liveStatus!.jobId);
                        return newSet;
                      });
                    }}
                    onViewDetails={() => {
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input Area */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Ask me to merge duplicates, analyze data quality, or run operations..."
            className="flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                const target = e.target as HTMLInputElement;
                if (target.value.trim()) {
                  handleSendMessage(target.value);
                  target.value = '';
                }
              }
            }}
          />
          <button
            onClick={() => {
              const input = document.querySelector('input') as HTMLInputElement;
              if (input?.value.trim()) {
                handleSendMessage(input.value);
                input.value = '';
              }
            }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};