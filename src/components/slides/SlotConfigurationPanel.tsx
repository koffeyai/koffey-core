import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Database, Sparkles, Type, Image as ImageIcon, X } from 'lucide-react';
import type { SlotMappingType, SlideElementType, SlotFormatType } from '@/types/slides';

// Data sources organized by category
const DATA_SOURCES = {
  account: [
    { value: 'account.name', label: 'Company Name' },
    { value: 'account.industry', label: 'Industry' },
    { value: 'account.website', label: 'Website' },
    { value: 'account.domain', label: 'Domain' },
    { value: 'account.phone', label: 'Phone' },
    { value: 'account.address', label: 'Address' },
    { value: 'account.description', label: 'Description' },
  ],
  deal: [
    { value: 'deal.name', label: 'Deal Name' },
    { value: 'deal.amount', label: 'Deal Amount' },
    { value: 'deal.stage', label: 'Deal Stage' },
    { value: 'deal.probability', label: 'Probability' },
    { value: 'deal.expected_close_date', label: 'Expected Close Date' },
    { value: 'deal.key_use_case', label: 'Key Use Case' },
    { value: 'deal.products_positioned', label: 'Products Positioned' },
    { value: 'deal.description', label: 'Description' },
  ],
  contact: [
    { value: 'contact.full_name', label: 'Full Name' },
    { value: 'contact.first_name', label: 'First Name' },
    { value: 'contact.last_name', label: 'Last Name' },
    { value: 'contact.email', label: 'Email' },
    { value: 'contact.phone', label: 'Phone' },
    { value: 'contact.title', label: 'Job Title' },
    { value: 'contact.company', label: 'Company' },
    { value: 'contact.linkedin_url', label: 'LinkedIn URL' },
  ],
  computed: [
    { value: 'computed.today', label: 'Today\'s Date' },
    { value: 'computed.quarter', label: 'Current Quarter' },
    { value: 'computed.your_company_name', label: 'Your Company Name' },
    { value: 'computed.rep_name', label: 'Sales Rep Name' },
  ],
};

const IMAGE_DATA_SOURCES = [
  { value: 'account.logo_url', label: 'Company Logo' },
  { value: 'contact.avatar_url', label: 'Contact Avatar' },
  { value: 'computed.your_company_logo', label: 'Your Company Logo' },
];

const FORMAT_OPTIONS: { value: SlotFormatType; label: string }[] = [
  { value: 'currency', label: 'Currency ($1,000)' },
  { value: 'date', label: 'Date (Jan 1, 2024)' },
  { value: 'percentage', label: 'Percentage (75%)' },
  { value: 'title_case', label: 'Title Case' },
  { value: 'uppercase', label: 'UPPERCASE' },
];

const VARIABLE_CHIPS = [
  '{account.name}',
  '{contact.full_name}',
  '{contact.title}',
  '{deal.name}',
  '{deal.amount}',
  '{computed.today}',
];

interface SlotConfigurationPanelProps {
  elementId: string;
  slideIndex: number;
  elementType: SlideElementType;
  placeholderText?: string;
  currentMapping?: {
    slotName: string;
    mappingType: SlotMappingType;
    dataSource?: string;
    aiPrompt?: string;
    aiModel: string;
    aiMaxTokens: number;
    aiTemperature: number;
    maxCharacters?: number;
    formatAs?: SlotFormatType;
    fallbackValue?: string;
  };
  onSave: (mapping: {
    slotName: string;
    mappingType: SlotMappingType;
    dataSource?: string;
    aiPrompt?: string;
    aiModel: string;
    aiMaxTokens: number;
    aiTemperature: number;
    maxCharacters?: number;
    formatAs?: SlotFormatType;
    fallbackValue?: string;
  }) => void;
  onClose: () => void;
  onDelete?: () => void;
}

export function SlotConfigurationPanel({
  elementId,
  slideIndex,
  elementType,
  placeholderText,
  currentMapping,
  onSave,
  onClose,
  onDelete,
}: SlotConfigurationPanelProps) {
  const [slotName, setSlotName] = useState(currentMapping?.slotName || placeholderText?.slice(0, 30) || `Element ${elementId.slice(0, 8)}`);
  const [mappingType, setMappingType] = useState<SlotMappingType>(currentMapping?.mappingType || 'direct');
  const [dataSource, setDataSource] = useState(currentMapping?.dataSource || '');
  const [aiPrompt, setAiPrompt] = useState(currentMapping?.aiPrompt || '');
  const [aiModel, setAiModel] = useState(currentMapping?.aiModel || 'claude');
  const [aiMaxTokens, setAiMaxTokens] = useState(currentMapping?.aiMaxTokens || 150);
  const [aiTemperature, setAiTemperature] = useState(currentMapping?.aiTemperature || 0.7);
  const [maxCharacters, setMaxCharacters] = useState<number | undefined>(currentMapping?.maxCharacters);
  const [formatAs, setFormatAs] = useState<SlotFormatType | undefined>(currentMapping?.formatAs);
  const [fallbackValue, setFallbackValue] = useState(currentMapping?.fallbackValue || '');
  const [staticValue, setStaticValue] = useState('');

  const isImageElement = elementType === 'image';

  const handleInsertVariable = (variable: string) => {
    setAiPrompt((prev) => prev + ' ' + variable);
  };

  const handleApply = () => {
    onSave({
      slotName,
      mappingType,
      dataSource: mappingType === 'direct' ? dataSource : undefined,
      aiPrompt: mappingType === 'ai_generated' ? aiPrompt : undefined,
      aiModel,
      aiMaxTokens,
      aiTemperature,
      maxCharacters,
      formatAs,
      fallbackValue: mappingType === 'static' ? staticValue : fallbackValue,
    });
  };

  const getElementTypeIcon = () => {
    switch (elementType) {
      case 'text':
        return <Type className="h-4 w-4" />;
      case 'image':
        return <ImageIcon className="h-4 w-4" />;
      default:
        return <Database className="h-4 w-4" />;
    }
  };

  return (
    <Card className="h-full overflow-auto">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {getElementTypeIcon()}
            Slot Configuration
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {placeholderText && (
          <p className="text-xs text-muted-foreground truncate">
            Original: "{placeholderText}"
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Slot Name */}
        <div className="space-y-2">
          <Label htmlFor="slot-name">Slot Name</Label>
          <Input
            id="slot-name"
            value={slotName}
            onChange={(e) => setSlotName(e.target.value)}
            placeholder="e.g., Company Title"
          />
        </div>

        <Separator />

        {/* Mapping Type */}
        <div className="space-y-3">
          <Label>Mapping Type</Label>
          <RadioGroup
            value={mappingType}
            onValueChange={(v) => setMappingType(v as SlotMappingType)}
            className="space-y-2"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="direct" id="direct" />
              <Label htmlFor="direct" className="flex items-center gap-2 cursor-pointer">
                <Database className="h-4 w-4 text-primary" />
                Direct Data
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="ai_generated" id="ai_generated" />
              <Label htmlFor="ai_generated" className="flex items-center gap-2 cursor-pointer">
                <Sparkles className="h-4 w-4 text-purple-500" />
                AI Generated
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="static" id="static" />
              <Label htmlFor="static" className="flex items-center gap-2 cursor-pointer">
                <Type className="h-4 w-4 text-green-500" />
                Static Value
              </Label>
            </div>
          </RadioGroup>
        </div>

        <Separator />

        {/* Direct Data Source */}
        {mappingType === 'direct' && (
          <div className="space-y-2">
            <Label>Data Source</Label>
            <Select value={dataSource} onValueChange={setDataSource}>
              <SelectTrigger>
                <SelectValue placeholder="Select data source..." />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {isImageElement ? (
                  <SelectGroup>
                    <SelectLabel>Image Sources</SelectLabel>
                    {IMAGE_DATA_SOURCES.map((src) => (
                      <SelectItem key={src.value} value={src.value}>
                        {src.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : (
                  <>
                    <SelectGroup>
                      <SelectLabel>Account</SelectLabel>
                      {DATA_SOURCES.account.map((src) => (
                        <SelectItem key={src.value} value={src.value}>
                          {src.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Deal</SelectLabel>
                      {DATA_SOURCES.deal.map((src) => (
                        <SelectItem key={src.value} value={src.value}>
                          {src.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Contact</SelectLabel>
                      {DATA_SOURCES.contact.map((src) => (
                        <SelectItem key={src.value} value={src.value}>
                          {src.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Computed</SelectLabel>
                      {DATA_SOURCES.computed.map((src) => (
                        <SelectItem key={src.value} value={src.value}>
                          {src.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* AI Prompt Builder */}
        {mappingType === 'ai_generated' && (
          <div className="space-y-3">
            <Label>AI Prompt</Label>
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Write a compelling tagline for {contact.title} at {account.name}..."
              className="min-h-[100px]"
            />
            
            {/* Variable chips */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Insert variable:</Label>
              <div className="flex flex-wrap gap-1">
                {VARIABLE_CHIPS.map((chip) => (
                  <Badge
                    key={chip}
                    variant="secondary"
                    className="cursor-pointer hover:bg-secondary/80 text-xs"
                    onClick={() => handleInsertVariable(chip)}
                  >
                    {chip}
                  </Badge>
                ))}
              </div>
            </div>

            {/* AI Model */}
            <div className="space-y-2">
              <Label>AI Model</Label>
              <Select value={aiModel} onValueChange={setAiModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="claude">Claude (Recommended)</SelectItem>
                  <SelectItem value="gemini">Gemini</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Temperature */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Temperature</Label>
                <span className="text-xs text-muted-foreground">{aiTemperature}</span>
              </div>
              <Slider
                value={[aiTemperature]}
                onValueChange={([v]) => setAiTemperature(v)}
                min={0.3}
                max={1}
                step={0.1}
              />
              <p className="text-xs text-muted-foreground">
                Lower = more focused, Higher = more creative
              </p>
            </div>

            {/* Max Tokens */}
            <div className="space-y-2">
              <Label>Max Tokens</Label>
              <Input
                type="number"
                value={aiMaxTokens}
                onChange={(e) => setAiMaxTokens(parseInt(e.target.value) || 150)}
                min={50}
                max={500}
              />
            </div>
          </div>
        )}

        {/* Static Value */}
        {mappingType === 'static' && (
          <div className="space-y-2">
            <Label>Static Value</Label>
            {isImageElement ? (
              <Input
                value={staticValue}
                onChange={(e) => setStaticValue(e.target.value)}
                placeholder="https://example.com/image.png"
              />
            ) : (
              <Textarea
                value={staticValue}
                onChange={(e) => setStaticValue(e.target.value)}
                placeholder="Enter fixed text..."
              />
            )}
          </div>
        )}

        <Separator />

        {/* Format Options (for text elements) */}
        {!isImageElement && (
          <>
            <div className="space-y-2">
              <Label>Max Characters</Label>
              <Input
                type="number"
                value={maxCharacters || ''}
                onChange={(e) => setMaxCharacters(e.target.value ? parseInt(e.target.value) : undefined)}
                placeholder="No limit"
              />
            </div>

            <div className="space-y-2">
              <Label>Format As</Label>
              <Select
                value={formatAs || ''}
                onValueChange={(v) => setFormatAs(v as SlotFormatType | undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No formatting" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="">No formatting</SelectItem>
                  {FORMAT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Fallback Value</Label>
              <Input
                value={fallbackValue}
                onChange={(e) => setFallbackValue(e.target.value)}
                placeholder="Value if data is missing..."
              />
            </div>
          </>
        )}

        <Separator />

        {/* Actions */}
        <div className="flex gap-2">
          <Button onClick={handleApply} className="flex-1">
            Apply to Element
          </Button>
          {currentMapping && onDelete && (
            <Button variant="destructive" size="icon" onClick={onDelete}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
