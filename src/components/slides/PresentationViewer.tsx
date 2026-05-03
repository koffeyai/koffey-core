import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Copy,
  X,
  Presentation,
  FileText,
  Loader2,
  MessageSquare
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SlideElement {
  type: string;
  role: string;
  content: string;
  style?: string;
}

interface Slide {
  index: number;
  type: string;
  layout: string;
  elements: SlideElement[];
}

interface SlideContent {
  metadata: {
    title: string;
    subtitle?: string;
    generatedAt: string;
    presentationType: string;
    accountName: string;
    dealName?: string;
  };
  slides: Slide[];
  speakerNotes: Record<string, string>;
}

interface PresentationViewerProps {
  presentationId: string;
  contentPath: string;
  title?: string;
  onClose: () => void;
  onDuplicate?: () => void;
}

export const PresentationViewer: React.FC<PresentationViewerProps> = ({
  presentationId,
  contentPath,
  title,
  onClose,
  onDuplicate
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showNotes, setShowNotes] = useState(true);

  // Fetch content
  const { data: content, isLoading, error } = useQuery({
    queryKey: ['presentation-content', presentationId],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('generated-slides')
        .download(contentPath);
      
      if (error) throw error;
      
      const text = await data.text();
      return JSON.parse(text) as SlideContent;
    }
  });

  const slides = content?.slides || [];
  const speakerNotes = content?.speakerNotes || {};
  const currentSlideData = slides[currentSlide];
  const currentNotes = speakerNotes[currentSlide.toString()];

  const goToPrevious = () => {
    setCurrentSlide(prev => Math.max(0, prev - 1));
  };

  const goToNext = () => {
    setCurrentSlide(prev => Math.min(slides.length - 1, prev + 1));
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrevious();
      if (e.key === 'ArrowRight') goToNext();
      if (e.key === 'Escape') onClose();
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slides.length, onClose]);

  // Get element styles based on role/style
  const getElementClasses = (element: SlideElement): string => {
    const baseClasses = 'leading-relaxed';
    
    switch (element.role) {
      case 'heading':
        return cn(baseClasses, 'text-2xl md:text-3xl font-bold text-foreground');
      case 'subheading':
        return cn(baseClasses, 'text-lg md:text-xl font-medium text-foreground/90');
      case 'emphasis':
        return cn(baseClasses, 'text-lg font-semibold text-primary');
      default:
        return cn(baseClasses, 'text-base text-foreground/80');
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading presentation...</p>
        </div>
      </div>
    );
  }

  if (error || !content) {
    return (
      <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Presentation className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="font-medium">Failed to load presentation</p>
            <p className="text-sm text-muted-foreground mt-2">
              {(error as Error)?.message || 'Content could not be retrieved'}
            </p>
            <Button onClick={onClose} className="mt-4">Close</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h2 className="font-semibold truncate">{title || content.metadata.title}</h2>
            <p className="text-xs text-muted-foreground truncate">
              {content.metadata.accountName}
              {content.metadata.dealName && ` • ${content.metadata.dealName}`}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowNotes(!showNotes)}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            {showNotes ? 'Hide' : 'Show'} Notes
          </Button>
          {onDuplicate && (
            <Button variant="outline" size="sm" onClick={onDuplicate}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </Button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Slide thumbnails */}
        <div className="w-48 border-r bg-muted/30 shrink-0 hidden md:block">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-2">
              {slides.map((slide, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlide(index)}
                  className={cn(
                    'w-full aspect-video rounded-lg border-2 transition-all overflow-hidden relative',
                    currentSlide === index 
                      ? 'border-primary shadow-lg' 
                      : 'border-transparent hover:border-muted-foreground/30'
                  )}
                >
                  <div className="absolute inset-0 bg-card flex items-center justify-center p-2">
                    <p className="text-[8px] text-center line-clamp-3 text-muted-foreground">
                      {slide.elements.find(e => e.role === 'heading')?.content || `Slide ${index + 1}`}
                    </p>
                  </div>
                  <Badge 
                    variant="secondary" 
                    className="absolute bottom-1 right-1 text-[10px] h-5 px-1.5"
                  >
                    {index + 1}
                  </Badge>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Current slide */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex items-center justify-center p-4 md:p-8 overflow-hidden">
            <Card className="w-full max-w-4xl aspect-video shadow-xl overflow-hidden">
              <CardContent className="h-full flex flex-col justify-center items-center p-6 md:p-12 text-center gap-4">
                {currentSlideData?.elements.map((element, idx) => (
                  <div 
                    key={idx}
                    className={getElementClasses(element)}
                  >
                    {element.content}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-center gap-4 py-4 border-t bg-background shrink-0">
            <Button 
              variant="outline" 
              size="icon"
              onClick={goToPrevious}
              disabled={currentSlide === 0}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="text-sm font-medium min-w-[4rem] text-center">
              {currentSlide + 1} / {slides.length}
            </span>
            <Button 
              variant="outline" 
              size="icon"
              onClick={goToNext}
              disabled={currentSlide === slides.length - 1}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Speaker notes panel */}
        {showNotes && (
          <div className="w-72 border-l bg-muted/30 shrink-0 hidden lg:flex flex-col">
            <div className="p-3 border-b flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Speaker Notes</span>
            </div>
            <ScrollArea className="flex-1">
              {currentNotes ? (
                <div className="p-4">
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                    {currentNotes}
                  </p>
                </div>
              ) : (
                <div className="p-4 text-center">
                  <p className="text-sm text-muted-foreground italic">
                    No speaker notes for this slide.
                  </p>
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
};
