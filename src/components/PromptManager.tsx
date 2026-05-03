import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Save, Edit, Eye, Clock, AlertCircle } from 'lucide-react';
import { useSystemPrompts } from '@/hooks/useSystemPrompts';
import { toast } from '@/hooks/use-toast';
import { UserPromptPreferences } from '@/components/settings/UserPromptPreferences';

export const PromptManager: React.FC = () => {
  const { prompts, activePrompt, loading, error, savePrompt } = useSystemPrompts();
  const [isEditing, setIsEditing] = useState(false);
  const [promptContent, setPromptContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Initialize prompt content from active prompt
  useEffect(() => {
    if (activePrompt) {
      setPromptContent(activePrompt.content);
    } else {
      // Default content if no active prompt exists
      setPromptContent(`You are an intelligent CRM assistant for koffey.ai. Your role is to help sales professionals manage their contacts, accounts, deals, and activities through natural conversation.

Key capabilities:
- Create and update contacts, accounts, and deals from natural language
- Log activities and set follow-up tasks
- Analyze sales pipeline and provide insights
- Answer questions about CRM data
- Provide sales productivity recommendations

When processing requests:
1. Extract entities (names, companies, amounts, dates) accurately
2. Create relationships between contacts, accounts, and deals
3. Log all interactions as activities
4. Set appropriate follow-up tasks when mentioned
5. Provide clear confirmations of actions taken

Be conversational, helpful, and focused on sales productivity. Always confirm important actions and ask for clarification when needed.`);
    }
  }, [activePrompt]);

  const handleSave = async () => {
    if (!promptContent.trim()) {
      toast({
        title: "Error",
        description: "Prompt content cannot be empty.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSaving(true);
      await savePrompt(promptContent);
      setIsEditing(false);
      
      toast({
        title: "Success",
        description: "System prompt has been saved and activated.",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to save system prompt.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading system prompts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-4 h-4" />
              <span className="font-medium">Error loading system prompts</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">System Prompts</h2>
        <div className="flex items-center space-x-2">
          {activePrompt && (
            <>
              <Badge variant="secondary">Version {activePrompt.version}</Badge>
              <Badge variant="outline" className="text-green-600">Active</Badge>
            </>
          )}
          {!activePrompt && (
            <Badge variant="outline" className="text-orange-600">No Active Prompt</Badge>
          )}
        </div>
      </div>

      {/* User Preferences Card - Phase 3 */}
      <UserPromptPreferences />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>CRM Assistant System Prompt</CardTitle>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? <Eye size={16} /> : <Edit size={16} />}
                {isEditing ? 'Preview' : 'Edit'}
              </Button>
              {isEditing && (
                <Button size="sm" onClick={handleSave} disabled={isSaving}>
                  <Save size={16} className="mr-2" />
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <Textarea
              value={promptContent}
              onChange={(e) => setPromptContent(e.target.value)}
              className="min-h-[400px] font-mono text-sm"
              placeholder="Enter system prompt..."
            />
          ) : (
            <div className="bg-muted/50 p-4 rounded-lg">
              <pre className="whitespace-pre-wrap text-sm">
                {promptContent}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prompt History</CardTitle>
        </CardHeader>
        <CardContent>
          {prompts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No prompt history available</p>
            </div>
          ) : (
            <div className="space-y-3">
              {prompts.map((prompt) => (
                <div key={prompt.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">Version {prompt.version}</div>
                    <div className="text-sm text-muted-foreground">
                      Created {new Date(prompt.created_at).toLocaleDateString()} at {new Date(prompt.created_at).toLocaleTimeString()}
                    </div>
                    {prompt.section_type && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Section: {prompt.section_type}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    {prompt.is_active ? (
                      <Badge variant="outline" className="text-green-600">Current</Badge>
                    ) : (
                      <Badge variant="secondary">Archived</Badge>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        setPromptContent(prompt.content);
                        setIsEditing(false);
                      }}
                    >
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
