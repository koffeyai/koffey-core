import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Loader2, MessageSquare, Paperclip } from 'lucide-react';
import { useDealNotes, DealNote } from '@/hooks/useDealNotes';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { SourceDocumentViewer } from './SourceDocumentViewer';
import { SourceDocument } from '@/hooks/useSourceDocuments';

interface DealNotesSectionProps {
  dealId: string;
}

const NOTE_TYPE_CONFIG: Record<string, { emoji: string; label: string; badgeClass: string }> = {
  meeting_notes: { emoji: '🗓️', label: 'Meeting Notes', badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
  analysis: { emoji: '🧠', label: 'Analysis', badgeClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' },
  deal_intel: { emoji: '🔍', label: 'Deal Intel', badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  internal: { emoji: '🔒', label: 'Internal', badgeClass: 'bg-muted text-muted-foreground border-border' },
  general: { emoji: '', label: '', badgeClass: '' },
};

export function DealNotesSection({ dealId }: DealNotesSectionProps) {
  const { notes, loading, createNote, deleteNote } = useDealNotes(dealId);
  const [isAdding, setIsAdding] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [sourceDocsMap, setSourceDocsMap] = useState<Record<string, SourceDocument>>({});
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedSourceDoc, setSelectedSourceDoc] = useState<SourceDocument | null>(null);

  // Fetch source documents for notes that have source_document_id
  useEffect(() => {
    const fetchSourceDocs = async () => {
      const sourceDocIds = notes
        .filter(n => n.source_document_id)
        .map(n => n.source_document_id as string);
      
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
  }, [notes]);

  const handleAddNote = async () => {
    if (!newContent.trim()) return;
    await createNote(newContent.trim());
    setNewContent('');
    setIsAdding(false);
  };

  const handleViewSource = (sourceDoc: SourceDocument) => {
    setSelectedSourceDoc(sourceDoc);
    setViewerOpen(true);
  };

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
        <h3 className="text-sm font-medium text-foreground">Notes</h3>
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
          <Textarea
            placeholder="Add a note about this deal..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={3}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setIsAdding(false); setNewContent(''); }}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAddNote} disabled={!newContent.trim()}>
              Save Note
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {notes.length === 0 && !isAdding && (
          <div className="text-center py-6">
            <MessageSquare className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No notes yet. Add one to keep track of important details.
            </p>
          </div>
        )}
        
        {notes.map((note) => {
          const noteConfig = NOTE_TYPE_CONFIG[note.note_type] || NOTE_TYPE_CONFIG.general;
          const sourceDoc = note.source_document_id ? sourceDocsMap[note.source_document_id] : null;

          return (
            <div 
              key={note.id} 
              className="p-3 border border-border rounded-lg hover:bg-muted/20 transition-colors group"
            >
              <div className="flex justify-between items-start gap-2">
                <p className="text-sm text-foreground whitespace-pre-wrap flex-1">
                  {note.content}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={() => deleteNote(note.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
              
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-xs text-muted-foreground">
                  {format(new Date(note.created_at), 'MMM d, yyyy · h:mm a')}
                </span>
                
                {noteConfig.label && (
                  <Badge variant="outline" className={`text-xs ${noteConfig.badgeClass}`}>
                    {noteConfig.emoji} {noteConfig.label}
                  </Badge>
                )}
              </div>

              {sourceDoc && (
                <button
                  onClick={() => handleViewSource(sourceDoc)}
                  className="flex items-center gap-1 mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  <Paperclip className="h-3 w-3" />
                  <span>From: {sourceDoc.title || 'Source Document'}</span>
                  <span className="text-muted-foreground/70">
                    — {format(new Date(sourceDoc.created_at), 'MMM d, yyyy')}
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <SourceDocumentViewer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        document={selectedSourceDoc}
      />
    </div>
  );
}
