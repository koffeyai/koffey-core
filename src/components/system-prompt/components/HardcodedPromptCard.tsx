import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Lock } from 'lucide-react';
import { HARDCODED_BASE_PROMPT } from '../constants';

export const HardcodedPromptCard = () => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-muted-foreground" />
          <div>
            <CardTitle>Core System Prompt (Hardcoded)</CardTitle>
            <CardDescription>This base prompt cannot be modified and provides core functionality</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          value={HARDCODED_BASE_PROMPT}
          readOnly
          className="min-h-[200px] text-sm bg-slate-50 text-slate-700 cursor-not-allowed border-slate-200 prompt-text-fix"
        />
      </CardContent>
    </Card>
  );
};