export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMProvider {
  analyze(messages: LLMMessage[], context?: any): Promise<any>;
  chat(messages: LLMMessage[]): Promise<string>;
  provider: string;
  model: string;
}

export interface LLMProviderConfig {
  provider: 'kimi' | 'gemini' | 'openai' | 'anthropic' | 'groq' | 'huggingface' | 'perplexity';
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

class KimiProvider implements LLMProvider {
  provider = 'kimi';
  model: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(model: string, apiKey: string, baseUrl: string = 'https://api.moonshot.ai/v1/chat/completions') {
    this.model = model;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async analyze(messages: LLMMessage[], context?: any): Promise<any> {
    const response = await this.chat(messages);
    try {
      return JSON.parse(response);
    } catch {
      return { response };
    }
  }

  async chat(messages: LLMMessage[]): Promise<string> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      throw new Error(`Kimi API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || 'No response generated';
  }
}

class OpenAIProvider implements LLMProvider {
  provider = 'openai';
  model: string;
  private apiKey: string;

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  async analyze(messages: LLMMessage[], context?: any): Promise<any> {
    const response = await this.chat(messages);
    try {
      return JSON.parse(response);
    } catch {
      return { response };
    }
  }

  async chat(messages: LLMMessage[]): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || 'No response generated';
  }
}

class AnthropicProvider implements LLMProvider {
  provider = 'anthropic';
  model: string;
  private apiKey: string;

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  async analyze(messages: LLMMessage[], context?: any): Promise<any> {
    const response = await this.chat(messages);
    try {
      return JSON.parse(response);
    } catch {
      return { response };
    }
  }

  async chat(messages: LLMMessage[]): Promise<string> {
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        system: systemMessage?.content,
        messages: otherMessages,
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0]?.text || 'No response generated';
  }
}

class GroqProvider implements LLMProvider {
  provider = 'groq';
  model: string;
  private apiKey: string;

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  async analyze(messages: LLMMessage[], context?: any): Promise<any> {
    const response = await this.chat(messages);
    try {
      return JSON.parse(response);
    } catch {
      return { response };
    }
  }

  async chat(messages: LLMMessage[]): Promise<string> {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || 'No response generated';
  }
}

class PerplexityProvider implements LLMProvider {
  provider = 'perplexity';
  model: string;
  private apiKey: string;

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  async analyze(messages: LLMMessage[], context?: any): Promise<any> {
    const response = await this.chat(messages);
    try {
      return JSON.parse(response);
    } catch {
      return { response };
    }
  }

  async chat(messages: LLMMessage[]): Promise<string> {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 2048,
        return_images: false,
        return_related_questions: false,
        search_recency_filter: 'month',
        frequency_penalty: 1,
        presence_penalty: 0,
      }),
    });

    if (!response.ok) {
      throw new Error(`Perplexity API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || 'No response generated';
  }
}

// Default AI model configuration (keep in sync with supabase/functions/_shared/ai-config.ts)
export const DEFAULT_AI_MODEL = 'kimi-k2.5';
export const DEFAULT_AI_PROVIDER = 'kimi';

// Available models by provider
export const AVAILABLE_MODELS = {
  kimi: [
    'kimi-k2.5',
    'kimi-k2-instruct-0905',
  ],
  gemini: [
    'gemini-2.5-pro',      // Latest, most capable
    'gemini-2.5-flash',    // Fast, balanced
    'gemini-1.5-pro',      // Previous generation
    'gemini-1.5-flash',    // Previous gen fast
  ],
  openai: [
    'gpt-4.1-2025-04-14',
    'o3-2025-04-16',
    'o4-mini-2025-04-16',
    'gpt-4.1-mini-2025-04-14',
    'gpt-4o'
  ],
  anthropic: [
    'claude-opus-4-20250514',
    'claude-sonnet-4-20250514',
    'claude-3-5-haiku-20241022'
  ],
  groq: [
    'moonshotai/kimi-k2-instruct-0905',
    'llama-3.3-70b-versatile',
    'llama3-8b-8192',
    'llama3-70b-8192',
    'mixtral-8x7b-32768'
  ],
  perplexity: [
    'llama-3.1-sonar-small-128k-online',
    'llama-3.1-sonar-large-128k-online',
    'llama-3.1-sonar-huge-128k-online'
  ]
} as const;

// Provider factory function
export function createLLMProvider(
  providerType: LLMProviderConfig['provider'], 
  model: string = 'default'
): LLMProvider {
  void providerType;
  void model;
  throw new Error(
    'Direct client-side LLM providers are disabled for security. Route requests through Supabase Edge Functions.'
  );
}

// Edge function compatible version that uses environment variables
export function createLLMProviderForEdgeFunction(
  providerType: LLMProviderConfig['provider'], 
  model: string = 'default'
): LLMProvider {
  const getDefaultModel = (provider: string) => {
    switch (provider) {
      case 'kimi': return DEFAULT_AI_MODEL;
      case 'openai': return 'gpt-4.1-2025-04-14';
      case 'anthropic': return 'claude-sonnet-4-20250514';
      case 'groq': return DEFAULT_AI_MODEL; // Kimi K2
      case 'perplexity': return 'llama-3.1-sonar-small-128k-online';
      default: return DEFAULT_AI_MODEL;
    }
  };

  const selectedModel = model === 'default' ? getDefaultModel(providerType) : model;

  // For edge functions, we need to use Deno.env.get
  switch (providerType) {
    case 'kimi':
      return new KimiProvider(
        selectedModel,
        (globalThis as any).Deno?.env?.get('KIMI_API_KEY') || (globalThis as any).Deno?.env?.get('MOONSHOT_API_KEY') || '',
        (globalThis as any).Deno?.env?.get('KIMI_BASE_URL') || (globalThis as any).Deno?.env?.get('MOONSHOT_BASE_URL') || 'https://api.moonshot.ai/v1/chat/completions'
      );
    case 'openai':
      return new OpenAIProvider(selectedModel, (globalThis as any).Deno?.env?.get('OPENAI_API_KEY') || '');
    case 'anthropic':
      return new AnthropicProvider(selectedModel, (globalThis as any).Deno?.env?.get('ANTHROPIC_API_KEY') || '');
    case 'groq':
      return new GroqProvider(selectedModel, (globalThis as any).Deno?.env?.get('GROQ_API_KEY') || '');
    case 'perplexity':
      return new PerplexityProvider(selectedModel, (globalThis as any).Deno?.env?.get('PERPLEXITY_API_KEY') || '');
    default:
      throw new Error(`Unsupported provider: ${providerType}`);
  }
}
