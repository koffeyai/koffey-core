import React from 'react';
import { Loader2, CheckCircle, AlertCircle, Eye, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAdminJobs, AdminJobExecution } from '@/hooks/useAdminJobs';
import { formatRelativeTime } from '@/lib/utils';

const JobProgressIndicator: React.FC<{ job: AdminJobExecution }> = ({ job }) => {
  const getStatusIcon = () => {
    switch (job.status) {
      case 'running':
        return <Loader2 className="w-3 h-3 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="w-3 h-3 text-green-500" />;
      case 'failed':
      case 'timeout':
        return <AlertCircle className="w-3 h-3 text-red-500" />;
      default:
        return <Loader2 className="w-3 h-3 text-muted-foreground" />;
    }
  };

  const getStatusColor = () => {
    switch (job.status) {
      case 'running':
        return 'bg-blue-500';
      case 'completed':
        return 'bg-green-500';
      case 'failed':
      case 'timeout':
        return 'bg-red-500';
      default:
        return 'bg-muted-foreground';
    }
  };

  return (
    <div className="flex items-center gap-2 min-w-0">
      {getStatusIcon()}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium truncate">
            {job.job_type.replace('_', ' ')}
          </span>
          <Badge variant="outline" className="text-xs px-1 py-0">
            {job.progress_percentage}%
          </Badge>
        </div>
        <div className="w-full mt-1">
          <Progress 
            value={job.progress_percentage} 
            className="h-1"
          />
        </div>
        {job.current_stage && (
          <div className="text-xs text-muted-foreground truncate mt-1">
            {job.current_stage}
          </div>
        )}
      </div>
    </div>
  );
};

export const AdminStatusBar: React.FC = () => {
  const { activeJobs, notifications, cancelJob } = useAdminJobs();
  const [showDetails, setShowDetails] = React.useState(false);

  const hasActiveOperations = activeJobs.length > 0;
  const lastUpdate = new Date();

  if (!hasActiveOperations && notifications.length === 0) {
    return (
      <div className="bg-gradient-to-r from-green-50 to-blue-50 border-b border-green-200/50 p-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-sm text-green-700 font-medium">All systems healthy</span>
          </div>
          <span className="text-xs text-muted-foreground">
            Last update: {lastUpdate.toLocaleTimeString()}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-b border-blue-200/50 p-2">
      <div className="flex items-center gap-4">
        {/* Active Jobs Summary */}
        {hasActiveOperations && (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <span className="text-sm font-medium text-blue-700">
              {activeJobs.length} active job{activeJobs.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Job Progress Indicators */}
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {activeJobs.slice(0, 3).map(job => (
            <div key={job.id} className="flex-1 min-w-0 max-w-xs">
              <JobProgressIndicator job={job} />
            </div>
          ))}
          {activeJobs.length > 3 && (
            <span className="text-xs text-muted-foreground">
              +{activeJobs.length - 3} more
            </span>
          )}
        </div>

        {/* Notifications Badge */}
        {notifications.length > 0 && (
          <Badge variant="destructive" className="text-xs">
            {notifications.length} alert{notifications.length !== 1 ? 's' : ''}
          </Badge>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => setShowDetails(!showDetails)}
          >
            <Eye className="w-3 h-3 mr-1" />
            Details
          </Button>
        </div>
      </div>

      {/* Expanded Details */}
      {showDetails && (
        <div className="mt-3 p-3 bg-white/50 rounded-md border border-blue-200/50">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-blue-800">Active Operations</h4>
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={() => setShowDetails(false)}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
          
          <div className="space-y-2">
            {activeJobs.map(job => (
              <div key={job.id} className="flex items-center justify-between p-2 bg-white rounded border">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {job.job_type.replace('_', ' ')}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {job.status}
                    </Badge>
                  </div>
                  {job.current_stage && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {job.current_stage}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <Progress value={job.progress_percentage} className="flex-1 h-2" />
                    <span className="text-xs text-muted-foreground">
                      {job.progress_percentage}%
                    </span>
                  </div>
                  {job.estimated_completion && (
                    <div className="text-xs text-muted-foreground mt-1">
                      ETA: {formatRelativeTime(new Date(job.estimated_completion))}
                    </div>
                  )}
                </div>
                
                {job.status === 'running' && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => cancelJob(job.id)}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Notifications */}
          {notifications.length > 0 && (
            <div className="mt-4">
              <h5 className="text-sm font-medium text-blue-800 mb-2">Recent Alerts</h5>
              <div className="space-y-1">
                {notifications.slice(0, 3).map(notification => (
                  <div key={notification.id} className="text-xs p-2 bg-white rounded border">
                    <div className="flex items-center gap-2">
                      <Badge variant={notification.type === 'error' ? 'destructive' : 'default'} className="text-xs">
                        {notification.type}
                      </Badge>
                      <span className="font-medium">{notification.title}</span>
                    </div>
                    <div className="text-muted-foreground mt-1">{notification.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};