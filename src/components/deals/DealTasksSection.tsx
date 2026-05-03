import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, Calendar, Trash2, Loader2, Check, Paperclip } from 'lucide-react';
import { useDealTasks, DealTask } from '@/hooks/useDealTasks';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { SourceDocumentViewer } from './SourceDocumentViewer';
import { SourceDocument } from '@/hooks/useSourceDocuments';

interface DealTasksSectionProps {
  dealId: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-destructive/10 text-destructive border-destructive/20',
  medium: 'bg-warning/10 text-warning border-warning/20',
  low: 'bg-muted text-muted-foreground border-border',
};

export function DealTasksSection({ dealId }: DealTasksSectionProps) {
  const { tasks, loading, createTask, toggleComplete, deleteTask } = useDealTasks(dealId);
  const [isAdding, setIsAdding] = useState(false);
  const [newTask, setNewTask] = useState<{ title: string; due_date: string; priority: 'low' | 'medium' | 'high' }>({ title: '', due_date: '', priority: 'medium' });
  const [showCompleted, setShowCompleted] = useState(false);
  const [sourceDocsMap, setSourceDocsMap] = useState<Record<string, SourceDocument>>({});
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedSourceDoc, setSelectedSourceDoc] = useState<SourceDocument | null>(null);

  // Fetch source documents for tasks that have source_document_id
  useEffect(() => {
    const fetchSourceDocs = async () => {
      const sourceDocIds = tasks
        .filter(t => t.source_document_id)
        .map(t => t.source_document_id as string);
      
      if (sourceDocIds.length === 0) return;

      const uniqueIds = [...new Set(sourceDocIds)];
      const { data } = await supabase
        .from('source_documents')
        .select('*')
        .in('id', uniqueIds);

      if (data) {
        const map: Record<string, SourceDocument> = {};
        data.forEach(doc => {
          map[doc.id] = doc as SourceDocument;
        });
        setSourceDocsMap(map);
      }
    };

    fetchSourceDocs();
  }, [tasks]);

  const handleAddTask = async () => {
    if (!newTask.title.trim()) return;
    
    await createTask({
      title: newTask.title,
      due_date: newTask.due_date || undefined,
      priority: newTask.priority,
    });
    
    setNewTask({ title: '', due_date: '', priority: 'medium' });
    setIsAdding(false);
  };

  const handleViewSource = (sourceDoc: SourceDocument) => {
    setSelectedSourceDoc(sourceDoc);
    setViewerOpen(true);
  };

  const activeTasks = tasks.filter(t => !t.completed);
  const completedTasks = tasks.filter(t => t.completed);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Next Steps</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsAdding(true)}
          className="h-8"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      {isAdding && (
        <div className="p-3 border border-border rounded-lg bg-muted/30 space-y-3">
          <Input
            placeholder="What needs to be done?"
            value={newTask.title}
            onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
            autoFocus
          />
          <div className="flex gap-2">
            <Input
              type="date"
              value={newTask.due_date}
              onChange={(e) => setNewTask(prev => ({ ...prev, due_date: e.target.value }))}
              className="flex-1"
            />
            <Select
              value={newTask.priority}
              onValueChange={(value: 'low' | 'medium' | 'high') => setNewTask(prev => ({ ...prev, priority: value }))}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setIsAdding(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAddTask}>
              Add Step
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {activeTasks.length === 0 && !isAdding && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No next steps yet. Add one to get started.
          </p>
        )}
        
        {activeTasks.map((task) => (
          <TaskItem 
            key={task.id} 
            task={task} 
            onToggle={toggleComplete} 
            onDelete={deleteTask}
            sourceDoc={task.source_document_id ? sourceDocsMap[task.source_document_id] : undefined}
            onViewSource={handleViewSource}
          />
        ))}
      </div>

      {completedTasks.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showCompleted ? 'Hide' : 'Show'} {completedTasks.length} completed
          </button>
          
          {showCompleted && (
            <div className="mt-2 space-y-2 opacity-60">
              {completedTasks.map((task) => (
                <TaskItem 
                  key={task.id} 
                  task={task} 
                  onToggle={toggleComplete} 
                  onDelete={deleteTask}
                  sourceDoc={task.source_document_id ? sourceDocsMap[task.source_document_id] : undefined}
                  onViewSource={handleViewSource}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <SourceDocumentViewer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        document={selectedSourceDoc}
      />
    </div>
  );
}

interface TaskItemProps {
  task: DealTask;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  sourceDoc?: SourceDocument;
  onViewSource: (doc: SourceDocument) => void;
}

function TaskItem({ task, onToggle, onDelete, sourceDoc, onViewSource }: TaskItemProps) {
  const priorityClass = PRIORITY_COLORS[task.priority || 'medium'] || PRIORITY_COLORS.medium;
  
  return (
    <div className="flex items-start gap-3 p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors group">
      <Checkbox
        checked={task.completed}
        onCheckedChange={() => onToggle(task.id)}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {task.due_date && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(task.due_date), 'MMM d')}
            </span>
          )}
          {task.google_event_id && (
            <TooltipProvider>
              <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-primary flex items-center gap-0.5">
                <Check className="h-3 w-3" />
                <Calendar className="h-3 w-3" />
              </span>
            </TooltipTrigger>
                <TooltipContent>
                  <p>Synced to Google Calendar</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Badge variant="outline" className={`text-xs ${priorityClass}`}>
            {task.priority || 'Medium'}
          </Badge>
        </div>
        
        {sourceDoc && (
          <button
            onClick={() => onViewSource(sourceDoc)}
            className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <Paperclip className="h-3 w-3" />
            <span>From meeting notes — {format(new Date(sourceDoc.created_at), 'MMM d')}</span>
          </button>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onDelete(task.id)}
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
    </div>
  );
}
