import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Mail, Send, Edit3, X, Loader2, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EmailDraftPayload } from '@/hooks/useChat';

interface EmailDraftCardProps {
  draft: EmailDraftPayload;
  onSend: (draft: EmailDraftPayload) => Promise<boolean> | boolean;
  onApplyVoiceNotes?: (draft: EmailDraftPayload, voiceNotes: string) => Promise<void> | void;
  onCancel: () => void;
  disabled?: boolean;
}

export const EmailDraftCard: React.FC<EmailDraftCardProps> = ({
  draft,
  onSend,
  onApplyVoiceNotes,
  onCancel,
  disabled = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isApplyingVoice, setIsApplyingVoice] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [editedSubject, setEditedSubject] = useState(draft.subject);
  const [editedBody, setEditedBody] = useState(draft.body);
  const [voiceNotes, setVoiceNotes] = useState(draft.voice_notes || '');

  const handleSend = async () => {
    setIsSending(true);
    try {
      const success = await onSend({
        ...draft,
        subject: editedSubject,
        body: editedBody,
        voice_notes: voiceNotes.trim() || draft.voice_notes,
      });
      setIsSent(success !== false);
    } finally {
      setIsSending(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditedSubject(draft.subject);
    setEditedBody(draft.body);
    setIsEditing(false);
  };

  const handleCopy = async () => {
    const text = `Subject: ${editedSubject}\n\n${editedBody}`;
    await navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleApplyVoiceNotes = async () => {
    const trimmed = voiceNotes.trim();
    if (!trimmed || !onApplyVoiceNotes) return;
    setIsApplyingVoice(true);
    try {
      await onApplyVoiceNotes({
        ...draft,
        subject: editedSubject,
        body: editedBody,
        voice_notes: trimmed,
      }, trimmed);
    } finally {
      setIsApplyingVoice(false);
    }
  };

  return (
    <Card className={cn(
      "border-2 border-l-4 border-l-blue-500 border-blue-200/50 bg-blue-50/30 dark:bg-blue-950/10",
      "max-w-[90%]"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Review email before sending</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Nothing sends until you press Send.</p>
            </div>
            {draft.tone && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {draft.tone}
              </Badge>
            )}
          </div>
          {draft.deal_context && (
            <Badge variant="outline" className="text-[10px]">
              {draft.deal_context.name}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pb-4">
        {/* To field */}
        <div className="text-sm">
          <span className="font-medium text-muted-foreground">To: </span>
          <span>{draft.to_name || ''} {draft.to_email ? `<${draft.to_email}>` : '(no email on file)'}</span>
        </div>

        {/* Subject */}
        <div className="text-sm">
          <span className="font-medium text-muted-foreground">Subject: </span>
          {isEditing ? (
            <Input
              value={editedSubject}
              onChange={(e) => setEditedSubject(e.target.value)}
              className="mt-1 text-sm"
            />
          ) : (
            <span className="font-medium">{editedSubject}</span>
          )}
        </div>

        {/* Body */}
        <div className="text-sm">
          <span className="font-medium text-muted-foreground block mb-1">Body:</span>
          {isEditing ? (
            <Textarea
              value={editedBody}
              onChange={(e) => setEditedBody(e.target.value)}
              rows={8}
              className="text-sm font-mono"
            />
          ) : (
            <div className="bg-background/60 border rounded-md p-3 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
              {editedBody}
            </div>
          )}
        </div>

        {/* Voice notes */}
        <div className="rounded-md border bg-background/60 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-muted-foreground">Voice notes</span>
            {draft.audience_scope && (
              <Badge variant="outline" className="text-[10px] capitalize">
                {draft.audience_scope}-facing
              </Badge>
            )}
          </div>
          <Textarea
            value={voiceNotes}
            onChange={(e) => setVoiceNotes(e.target.value)}
            rows={3}
            className="text-sm"
            placeholder="Concise, warm, direct; avoid hype; sign off with your preferred name."
            disabled={disabled || isSending || isSent || isApplyingVoice}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Style guidance only. Not included in the sent email.</p>
            {onApplyVoiceNotes && (
              <Button
                onClick={handleApplyVoiceNotes}
                variant="outline"
                size="sm"
                disabled={disabled || isSending || isSent || isApplyingVoice || !voiceNotes.trim()}
              >
                {isApplyingVoice ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Edit3 className="h-4 w-4 mr-1.5" />
                )}
                Regenerate
              </Button>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            onClick={handleSend}
            className="flex-1 min-w-[100px]"
            disabled={disabled || isSending || isSent || !draft.to_email}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : isSent ? (
              <Check className="h-4 w-4 mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {isSending ? 'Sending...' : isSent ? 'Sent' : 'Send'}
          </Button>

          {isEditing ? (
            <Button
              onClick={handleCancelEdit}
              variant="outline"
              className="flex-1 min-w-[100px]"
            >
              <X className="h-4 w-4 mr-2" />
              Cancel Edit
            </Button>
          ) : (
            <Button
              onClick={handleEdit}
              variant="outline"
              className="flex-1 min-w-[100px]"
              disabled={disabled || isSending || isSent}
            >
              <Edit3 className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}

          <Button
            onClick={handleCopy}
            variant="outline"
            size="sm"
            disabled={isSending || isSent}
          >
            {isCopied ? (
              <Check className="h-4 w-4 mr-1.5 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 mr-1.5" />
            )}
            {isCopied ? 'Copied' : 'Copy'}
          </Button>

          <Button
            onClick={onCancel}
            variant="ghost"
            size="sm"
            disabled={isSending || isSent}
          >
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
