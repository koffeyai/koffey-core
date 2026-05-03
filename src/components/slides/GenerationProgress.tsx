import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, 
  Circle, 
  Loader2, 
  Download, 
  Link2, 
  RefreshCw, 
  FileText,
  Clock,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

interface GenerationStep {
  id: string;
  label: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
}

interface GenerationResult {
  success: boolean;
  presentationId: string | null;
  downloadUrl: string;
  fileName: string;
  slideCount: number;
  generationTimeMs: number;
  aiSlotsProcessed: number;
}

interface GenerationProgressProps {
  isGenerating: boolean;
  result: GenerationResult | null;
  error: string | null;
  onRegenerate: () => void;
  onViewHistory: () => void;
}

const GENERATION_STEPS: GenerationStep[] = [
  { id: 'template', label: 'Loading template', status: 'pending' },
  { id: 'crm', label: 'Fetching CRM data', status: 'pending' },
  { id: 'ai', label: 'Generating AI content', status: 'pending' },
  { id: 'inject', label: 'Injecting content into slides', status: 'pending' },
  { id: 'finalize', label: 'Finalizing presentation', status: 'pending' }
];

export function GenerationProgress({
  isGenerating,
  result,
  error,
  onRegenerate,
  onViewHistory
}: GenerationProgressProps) {
  const [steps, setSteps] = useState<GenerationStep[]>(GENERATION_STEPS);
  const [progress, setProgress] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null);

  // Simulate progress during generation
  useEffect(() => {
    if (!isGenerating) {
      if (result?.success) {
        // Mark all steps as completed
        setSteps(GENERATION_STEPS.map(s => ({ ...s, status: 'completed' })));
        setProgress(100);
      } else if (error) {
        // Mark failed step
        setSteps(prev => prev.map((s, idx) => ({
          ...s,
          status: idx < 3 ? 'completed' : idx === 3 ? 'error' : 'pending'
        })));
      }
      return;
    }

    // Reset on start
    setSteps(GENERATION_STEPS.map(s => ({ ...s, status: 'pending' })));
    setProgress(0);
    setEstimatedTime(15);

    // Simulate step progression
    const stepDurations = [1000, 1500, 5000, 3000, 1500];
    let currentStep = 0;
    let elapsed = 0;

    const interval = setInterval(() => {
      elapsed += 200;
      
      // Update current step
      let totalDuration = 0;
      for (let i = 0; i <= currentStep && i < stepDurations.length; i++) {
        totalDuration += stepDurations[i];
      }
      
      if (elapsed >= totalDuration && currentStep < GENERATION_STEPS.length - 1) {
        currentStep++;
        setSteps(prev => prev.map((s, idx) => ({
          ...s,
          status: idx < currentStep ? 'completed' : idx === currentStep ? 'in_progress' : 'pending'
        })));
      } else if (currentStep === 0) {
        setSteps(prev => prev.map((s, idx) => ({
          ...s,
          status: idx === 0 ? 'in_progress' : 'pending'
        })));
      }

      // Update progress
      const totalTime = stepDurations.reduce((a, b) => a + b, 0);
      const newProgress = Math.min((elapsed / totalTime) * 100, 95);
      setProgress(newProgress);

      // Update estimated time
      const remaining = Math.max(0, Math.ceil((totalTime - elapsed) / 1000));
      setEstimatedTime(remaining);
    }, 200);

    return () => clearInterval(interval);
  }, [isGenerating, result, error]);

  function copyDownloadLink() {
    if (result?.downloadUrl) {
      navigator.clipboard.writeText(result.downloadUrl);
      toast.success('Link copied to clipboard');
    }
  }

  function downloadPresentation() {
    if (result?.downloadUrl) {
      const link = document.createElement('a');
      link.href = result.downloadUrl;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Download started');
    }
  }

  // Show generating state
  if (isGenerating) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Generating Presentation...
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{Math.round(progress)}%</span>
              {estimatedTime !== null && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  ~{estimatedTime}s remaining
                </span>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {steps.map(step => (
              <div key={step.id} className="flex items-center gap-3">
                {step.status === 'completed' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : step.status === 'in_progress' ? (
                  <Loader2 className="h-5 w-5 text-primary animate-spin" />
                ) : step.status === 'error' ? (
                  <Circle className="h-5 w-5 text-destructive" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/30" />
                )}
                <span className={step.status === 'pending' ? 'text-muted-foreground' : ''}>
                  {step.label}
                  {step.status === 'in_progress' && '...'}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show error state
  if (error) {
    return (
      <Card className="w-full border-destructive/50">
        <CardHeader>
          <CardTitle className="text-lg text-destructive">Generation Failed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{error}</p>
          <div className="flex gap-2">
            <Button onClick={onRegenerate}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show success state
  if (result?.success) {
    const generationTime = result.generationTimeMs 
      ? `${(result.generationTimeMs / 1000).toFixed(1)}s`
      : 'Unknown';

    return (
      <Card className="w-full border-green-500/30 bg-green-500/5">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-green-600 dark:text-green-500">
            <CheckCircle2 className="h-5 w-5" />
            Presentation Ready!
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-primary/10 rounded-lg">
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium">{result.fileName}</h3>
              <div className="flex flex-wrap gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  {result.slideCount} slides
                </Badge>
                {result.aiSlotsProcessed > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    <Sparkles className="h-3 w-3 mr-1" />
                    {result.aiSlotsProcessed} AI-enhanced
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  Generated in {generationTime}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={downloadPresentation}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button variant="outline" onClick={copyDownloadLink}>
              <Link2 className="h-4 w-4 mr-2" />
              Copy Link
            </Button>
            <Button variant="outline" onClick={onRegenerate}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Regenerate
            </Button>
          </div>

          <div className="pt-4 border-t">
            <Button variant="ghost" size="sm" onClick={onViewHistory} className="text-muted-foreground">
              View All Generated Presentations →
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
