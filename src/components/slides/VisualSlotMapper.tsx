import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Card } from '@/components/ui/card';
import { Save, X, Check, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { ElementOverlay } from './ElementOverlay';
import { SlideNavigator } from './SlideNavigator';
import { SlotConfigurationPanel } from './SlotConfigurationPanel';
import { useSlotMappings } from '@/hooks/useSlotMappings';
import type { ExtractedSlideStructure, SlideElementType } from '@/types/slides';

// Standard slide dimensions (EMU -> pixels approximation)
const DEFAULT_SLIDE_WIDTH = 914400 / 9525; // ~96 pixels per inch
const DEFAULT_SLIDE_HEIGHT = 6858000 / 9525;

interface VisualSlotMapperProps {
  templateId: string;
  templateName: string;
  extractedStructure: ExtractedSlideStructure;
  organizationId: string;
  onClose?: () => void;
}

interface SelectedElement {
  elementId: string;
  slideIndex: number;
  elementType: SlideElementType;
  content?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export function VisualSlotMapper({
  templateId,
  templateName,
  extractedStructure,
  organizationId,
  onClose,
}: VisualSlotMapperProps) {
  const navigate = useNavigate();
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [previewDimensions] = useState({ width: 640, height: 360 });

  const {
    mappings,
    isLoading,
    saveStatus,
    upsertMapping,
    deleteMapping,
    getMappingForElement,
    isElementMapped,
    getMappingsBySlide,
    validateMappings,
    saveAll,
  } = useSlotMappings({
    templateId,
    organizationId,
  });

  // Get slide dimensions from metadata or use defaults
  const slideWidth = extractedStructure.metadata?.width || DEFAULT_SLIDE_WIDTH;
  const slideHeight = extractedStructure.metadata?.height || DEFAULT_SLIDE_HEIGHT;

  // Calculate slide info for navigator
  const slideInfos = useMemo(() => {
    return extractedStructure.slides.map((slide) => ({
      index: slide.index,
      elementCount: slide.elements.length,
      mappedCount: getMappingsBySlide(slide.index).length,
    }));
  }, [extractedStructure.slides, getMappingsBySlide]);

  const currentSlide = extractedStructure.slides[currentSlideIndex];

  const handleElementClick = useCallback(
    (element: {
      element_id: string;
      element_type: SlideElementType;
      content?: string;
      bounding_box?: { x: number; y: number; width: number; height: number };
    }) => {
      setSelectedElement({
        elementId: element.element_id,
        slideIndex: currentSlideIndex,
        elementType: element.element_type,
        content: element.content,
        boundingBox: element.bounding_box,
      });
    },
    [currentSlideIndex]
  );

  const handleElementKeyDown = useCallback(
    (e: React.KeyboardEvent, element: any) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleElementClick(element);
      }
    },
    [handleElementClick]
  );

  const handleSaveMapping = useCallback(
    (config: {
      slotName: string;
      mappingType: any;
      dataSource?: string;
      aiPrompt?: string;
      aiModel: string;
      aiMaxTokens: number;
      aiTemperature: number;
      maxCharacters?: number;
      formatAs?: any;
      fallbackValue?: string;
    }) => {
      if (!selectedElement) return;

      upsertMapping(selectedElement.elementId, selectedElement.slideIndex, {
        elementType: selectedElement.elementType,
        placeholderText: selectedElement.content,
        boundingBox: selectedElement.boundingBox,
        ...config,
      });

      toast.success('Mapping saved');
    },
    [selectedElement, upsertMapping]
  );

  const handleDeleteMapping = useCallback(() => {
    if (!selectedElement) return;
    deleteMapping(selectedElement.elementId, selectedElement.slideIndex);
    setSelectedElement(null);
    toast.success('Mapping removed');
  }, [selectedElement, deleteMapping]);

  const handleSaveAndExit = async () => {
    const issues = validateMappings();
    if (issues.length > 0) {
      toast.warning(`Validation issues: ${issues[0]}`);
    }

    const result = await saveAll();
    if (result.success) {
      toast.success('All mappings saved');
      if (onClose) {
        onClose();
      } else {
        navigate('/slides');
      }
    } else {
      toast.error('Failed to save mappings');
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      navigate('/slides');
    }
  };

  const getSaveStatusBadge = () => {
    switch (saveStatus) {
      case 'saving':
        return (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving...
          </Badge>
        );
      case 'saved':
        return (
          <Badge variant="secondary" className="gap-1 bg-green-500/10 text-green-600">
            <Check className="h-3 w-3" />
            Saved
          </Badge>
        );
      case 'unsaved':
        return (
          <Badge variant="secondary" className="gap-1 bg-yellow-500/10 text-yellow-600">
            <AlertCircle className="h-3 w-3" />
            Unsaved changes
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            Save error
          </Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-card px-4 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Mapping: {templateName}</h2>
            {getSaveStatusBadge()}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleClose}>
              <X className="h-4 w-4 mr-2" />
              Exit
            </Button>
            <Button onClick={handleSaveAndExit}>
              <Save className="h-4 w-4 mr-2" />
              Save & Exit
            </Button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left panel - Slide preview */}
          <div className="flex-1 p-4 overflow-auto">
            <div className="space-y-4">
              {/* Slide preview container */}
              <Card className="relative overflow-hidden">
                <div
                  className="relative bg-muted"
                  style={{
                    width: previewDimensions.width,
                    height: previewDimensions.height,
                    maxWidth: '100%',
                    margin: '0 auto',
                  }}
                >
                  {/* Slide background placeholder */}
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <span className="text-sm">Slide {currentSlideIndex + 1}</span>
                  </div>

                  {/* Element overlays */}
                  {currentSlide?.elements.map((element, idx) => {
                    const mapping = getMappingForElement(element.element_id, currentSlideIndex);
                    const isMapped = isElementMapped(element.element_id, currentSlideIndex);
                    const isSelected =
                      selectedElement?.elementId === element.element_id &&
                      selectedElement?.slideIndex === currentSlideIndex;

                    return (
                      <ElementOverlay
                        key={element.element_id}
                        elementId={element.element_id}
                        elementType={element.element_type as SlideElementType}
                        boundingBox={element.bounding_box || { x: 50 + idx * 30, y: 50 + idx * 30, width: 200, height: 50 }}
                        content={element.content}
                        mappingType={mapping?.mappingType}
                        slotName={mapping?.slotName}
                        isSelected={isSelected}
                        isMapped={isMapped}
                        previewWidth={previewDimensions.width}
                        previewHeight={previewDimensions.height}
                        slideWidth={slideWidth}
                        slideHeight={slideHeight}
                        onClick={() => handleElementClick(element as any)}
                        onKeyDown={(e) => handleElementKeyDown(e, element)}
                        tabIndex={idx}
                      />
                    );
                  })}
                </div>
              </Card>

              {/* Slide navigator */}
              <SlideNavigator
                slides={slideInfos}
                currentSlideIndex={currentSlideIndex}
                onSlideChange={setCurrentSlideIndex}
              />
            </div>
          </div>

          {/* Right panel - Configuration */}
          <div className="w-[340px] border-l bg-card overflow-auto">
            {selectedElement ? (
              <SlotConfigurationPanel
                elementId={selectedElement.elementId}
                slideIndex={selectedElement.slideIndex}
                elementType={selectedElement.elementType}
                placeholderText={selectedElement.content}
                currentMapping={
                  getMappingForElement(selectedElement.elementId, selectedElement.slideIndex)
                    ? {
                        slotName: getMappingForElement(selectedElement.elementId, selectedElement.slideIndex)!.slotName,
                        mappingType: getMappingForElement(selectedElement.elementId, selectedElement.slideIndex)!.mappingType,
                        dataSource: getMappingForElement(selectedElement.elementId, selectedElement.slideIndex)!.dataSource,
                        aiPrompt: getMappingForElement(selectedElement.elementId, selectedElement.slideIndex)!.aiPrompt,
                        aiModel: getMappingForElement(selectedElement.elementId, selectedElement.slideIndex)!.aiModel,
                        aiMaxTokens: getMappingForElement(selectedElement.elementId, selectedElement.slideIndex)!.aiMaxTokens,
                        aiTemperature: getMappingForElement(selectedElement.elementId, selectedElement.slideIndex)!.aiTemperature,
                        maxCharacters: getMappingForElement(selectedElement.elementId, selectedElement.slideIndex)!.maxCharacters,
                        formatAs: getMappingForElement(selectedElement.elementId, selectedElement.slideIndex)!.formatAs,
                        fallbackValue: getMappingForElement(selectedElement.elementId, selectedElement.slideIndex)!.fallbackValue,
                      }
                    : undefined
                }
                onSave={handleSaveMapping}
                onClose={() => setSelectedElement(null)}
                onDelete={
                  isElementMapped(selectedElement.elementId, selectedElement.slideIndex)
                    ? handleDeleteMapping
                    : undefined
                }
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                </div>
                <h3 className="font-medium mb-2">Select an Element</h3>
                <p className="text-sm">
                  Click on any element in the slide preview to configure how it will be populated with data.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
