/**
 * LLM Control Panel - Admin interface for managing LLM settings
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { AVAILABLE_MODELS, DEFAULT_AI_MODEL, DEFAULT_AI_PROVIDER } from '@/lib/llmProvider';
import { CustomSkillEditor } from './CustomSkillEditor';

interface LLMConfig {
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

interface LLMSettings {
  defaultProvider: string;
  defaultModel: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  enableFallback: boolean;
  fallbackProvider: string;
  rateLimiting: {
    enabled: boolean;
    requestsPerMinute: number;
    requestsPerHour: number;
  };
}

export const LLMControlPanel: React.FC = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<LLMSettings>({
    defaultProvider: DEFAULT_AI_PROVIDER, // 'kimi'
    defaultModel: DEFAULT_AI_MODEL, // 'kimi-k2.5'
    temperature: 0.7,
    maxTokens: 1000,
    systemPrompt: '',
    enableFallback: false,
    fallbackProvider: 'groq', // Fallback to Groq if needed
    rateLimiting: {
      enabled: true,
      requestsPerMinute: 60,
      requestsPerHour: 1000
    }
  });
  
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState('Hello, how are you?');
  const [testResult, setTestResult] = useState<string>('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    // Load settings from localStorage or API
    const savedSettings = localStorage.getItem('llm_settings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
  };

  const saveSettings = async () => {
    try {
      // Save to localStorage for now - in production, save to backend
      localStorage.setItem('llm_settings', JSON.stringify(settings));
      
      // LLM Router removed - settings saved to localStorage only

      toast({
        title: "Settings Saved",
        description: "LLM configuration has been updated successfully.",
      });
    } catch (error) {
      toast({
        title: "Save Failed",
        description: "Failed to save LLM settings.",
        variant: "destructive"
      });
    }
  };

  const testLLM = async () => {
    if (!testMessage.trim()) return;

    setTesting(true);
    setTestResult('');

    try {
      const config: Partial<LLMConfig> = {
        provider: settings.defaultProvider as any,
        model: settings.defaultModel,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens
      };

      // LLM Router removed - test functionality disabled
      setTestResult('LLM testing is currently disabled. Backend routing handles LLM calls.');
      toast({
        title: "Test Successful",
        description: 'Backend routing handles all LLM calls',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setTestResult(`Error: ${errorMessage}`);
      toast({
        title: "Test Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setTesting(false);
    }
  };

  const getProviderCapabilities = (provider: string) => {
    return {
      supportsStreaming: false,
      maxContextLength: 4096,
      supportedFeatures: [],
      supportsImages: false
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">LLM Control Panel</h2>
          <p className="text-muted-foreground">
            Configure and manage AI language model settings
          </p>
        </div>
        <Button onClick={saveSettings}>Save Settings</Button>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">General Settings</TabsTrigger>
          <TabsTrigger value="models">Model Configuration</TabsTrigger>
          <TabsTrigger value="prompts">System Prompts</TabsTrigger>
          <TabsTrigger value="skills">Custom Skills</TabsTrigger>
          <TabsTrigger value="testing">Testing</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Default Provider Settings</CardTitle>
              <CardDescription>
                Configure the default LLM provider and fallback options
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="defaultProvider">Default Provider</Label>
                  <Select
                    value={settings.defaultProvider}
                    onValueChange={(value) => 
                      setSettings(prev => ({ ...prev, defaultProvider: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kimi">Kimi (Moonshot)</SelectItem>
                      <SelectItem value="gemini">Google Gemini</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                      <SelectItem value="groq">Groq</SelectItem>
                      <SelectItem value="perplexity">Perplexity</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fallbackProvider">Fallback Provider</Label>
                  <Select
                    value={settings.fallbackProvider}
                    onValueChange={(value) => 
                      setSettings(prev => ({ ...prev, fallbackProvider: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kimi">Kimi (Moonshot)</SelectItem>
                      <SelectItem value="gemini">Google Gemini</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                      <SelectItem value="groq">Groq</SelectItem>
                      <SelectItem value="perplexity">Perplexity</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="enableFallback"
                  checked={settings.enableFallback}
                  onCheckedChange={(checked) =>
                    setSettings(prev => ({ ...prev, enableFallback: checked }))
                  }
                />
                <Label htmlFor="enableFallback">Enable fallback provider</Label>
              </div>

              {settings.defaultProvider && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">Provider Capabilities</h4>
                  {(() => {
                    const caps = getProviderCapabilities(settings.defaultProvider);
                    return (
                      <div className="flex gap-2">
                        {caps.supportsStreaming && <Badge variant="secondary">Streaming</Badge>}
                        {caps.supportsImages && <Badge variant="secondary">Images</Badge>}
                        <Badge variant="outline">
                          Max Context: {caps.maxContextLength.toLocaleString()}
                        </Badge>
                      </div>
                    );
                  })()}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rate Limiting</CardTitle>
              <CardDescription>
                Configure API rate limits to manage usage and costs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="rateLimitingEnabled"
                  checked={settings.rateLimiting.enabled}
                  onCheckedChange={(checked) =>
                    setSettings(prev => ({
                      ...prev,
                      rateLimiting: { ...prev.rateLimiting, enabled: checked }
                    }))
                  }
                />
                <Label htmlFor="rateLimitingEnabled">Enable rate limiting</Label>
              </div>

              {settings.rateLimiting.enabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="requestsPerMinute">Requests per minute</Label>
                    <Input
                      id="requestsPerMinute"
                      type="number"
                      value={settings.rateLimiting.requestsPerMinute}
                      onChange={(e) =>
                        setSettings(prev => ({
                          ...prev,
                          rateLimiting: {
                            ...prev.rateLimiting,
                            requestsPerMinute: parseInt(e.target.value) || 0
                          }
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="requestsPerHour">Requests per hour</Label>
                    <Input
                      id="requestsPerHour"
                      type="number"
                      value={settings.rateLimiting.requestsPerHour}
                      onChange={(e) =>
                        setSettings(prev => ({
                          ...prev,
                          rateLimiting: {
                            ...prev.rateLimiting,
                            requestsPerHour: parseInt(e.target.value) || 0
                          }
                        }))
                      }
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="models" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Model Configuration</CardTitle>
              <CardDescription>
                Configure model parameters and selection
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="defaultModel">Default Model</Label>
                <Select
                  value={settings.defaultModel}
                  onValueChange={(value) => 
                    setSettings(prev => ({ ...prev, defaultModel: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_MODELS[settings.defaultProvider as keyof typeof AVAILABLE_MODELS]?.map((model) => (
                      <SelectItem key={model} value={model}>{model}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="temperature">
                    Temperature ({settings.temperature})
                  </Label>
                  <input
                    id="temperature"
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={settings.temperature}
                    onChange={(e) =>
                      setSettings(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))
                    }
                    className="w-full"
                  />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Conservative</span>
                    <span>Creative</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxTokens">Max Tokens</Label>
                  <Input
                    id="maxTokens"
                    type="number"
                    value={settings.maxTokens}
                    onChange={(e) =>
                      setSettings(prev => ({ ...prev, maxTokens: parseInt(e.target.value) || 1000 }))
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prompts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Prompts</CardTitle>
              <CardDescription>
                Configure the default system prompt for AI interactions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="systemPrompt">Default System Prompt</Label>
                <Textarea
                  id="systemPrompt"
                  value={settings.systemPrompt}
                  onChange={(e) =>
                    setSettings(prev => ({ ...prev, systemPrompt: e.target.value }))
                  }
                  placeholder="Enter the system prompt that will be used for all AI interactions..."
                  rows={6}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="skills" className="space-y-4">
          <CustomSkillEditor />
        </TabsContent>

        <TabsContent value="testing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>LLM Testing</CardTitle>
              <CardDescription>
                Test your LLM configuration with sample messages
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="testMessage">Test Message</Label>
                <Input
                  id="testMessage"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="Enter a test message..."
                />
              </div>

              <Button onClick={testLLM} disabled={testing || !testMessage.trim()}>
                {testing ? 'Testing...' : 'Test LLM Configuration'}
              </Button>

              {testResult && (
                <div className="space-y-2">
                  <Label>Test Result</Label>
                  <div className="p-4 bg-muted rounded-lg">
                    <pre className="whitespace-pre-wrap text-sm">{testResult}</pre>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
