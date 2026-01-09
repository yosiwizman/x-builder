import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import {
  clearProviderConfig,
  DEFAULT_MODELS,
  initProviderStore,
  isProviderConfigured,
  type LLMProvider,
  providerStore,
  redactApiKey,
  setProviderConfig,
  validateApiKey,
} from '~/lib/stores/providers';

const PROVIDERS: { id: LLMProvider; name: string; keyPrefix: string; docsUrl: string }[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    keyPrefix: 'sk-or-',
    docsUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    keyPrefix: 'sk-',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    keyPrefix: 'sk-ant-',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
];

interface ProviderSettingsProps {
  open: boolean;
  onClose: () => void;
}

export function ProviderSettings({ open, onClose }: ProviderSettingsProps) {
  const config = useStore(providerStore);
  const configured = useStore(isProviderConfigured);

  const [provider, setProvider] = useState<LLMProvider>('openrouter');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [showKey, setShowKey] = useState(false);

  // initialize store on mount
  useEffect(() => {
    initProviderStore();
  }, []);

  // sync form with store when dialog opens
  useEffect(() => {
    if (open && config) {
      setProvider(config.provider);
      setApiKey(config.apiKey);
      setModel(config.model || '');
    } else if (open && !config) {
      setProvider('openrouter');
      setApiKey('');
      setModel('');
    }
  }, [open, config]);

  const selectedProvider = PROVIDERS.find((p) => p.id === provider)!;

  const handleSave = () => {
    if (!apiKey) {
      toast.error('Please enter an API key');
      return;
    }

    if (!validateApiKey(provider, apiKey)) {
      toast.error(
        `Invalid API key format. ${selectedProvider.name} keys should start with "${selectedProvider.keyPrefix}"`,
      );
      return;
    }

    setProviderConfig({
      provider,
      apiKey,
      model: model || DEFAULT_MODELS[provider],
    });

    toast.success(`${selectedProvider.name} configured successfully!`);
    onClose();
  };

  const handleClear = () => {
    clearProviderConfig();
    setApiKey('');
    setModel('');
    toast.success('API key cleared');
  };

  return (
    <DialogRoot open={open}>
      <Dialog onBackdrop={onClose} onClose={onClose}>
        <DialogTitle>LLM Provider Settings</DialogTitle>
        <DialogDescription asChild>
          <div className="space-y-4">
            <p className="text-bolt-elements-textSecondary text-sm">
              Enter your API key to enable AI features. Your key is stored locally in your browser and sent only to the
              LLM provider.
            </p>

            {/* provider selection */}
            <div>
              <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-1">Provider</label>
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value as LLMProvider);
                  setModel('');
                }}
                className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <a
                href={selectedProvider.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary mt-1 inline-block"
              >
                Get an API key →
              </a>
            </div>

            {/* API key input */}
            <div>
              <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-1">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`${selectedProvider.keyPrefix}...`}
                  className="w-full px-3 py-2 pr-10 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary"
                >
                  <div className={showKey ? 'i-ph:eye-slash' : 'i-ph:eye'} />
                </button>
              </div>
              {configured && config?.provider === provider && (
                <p className="text-xs text-bolt-elements-textTertiary mt-1">Current: {redactApiKey(config.apiKey)}</p>
              )}
            </div>

            {/* model input (optional) */}
            <div>
              <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-1">
                Model <span className="text-bolt-elements-textTertiary">(optional)</span>
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={DEFAULT_MODELS[provider]}
                className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
              />
              <p className="text-xs text-bolt-elements-textTertiary mt-1">Default: {DEFAULT_MODELS[provider]}</p>
            </div>

            {/* status indicator */}
            {configured && (
              <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/20 rounded-md">
                <div className="i-ph:check-circle-fill text-green-500" />
                <span className="text-sm text-green-600 dark:text-green-400">
                  {PROVIDERS.find((p) => p.id === config?.provider)?.name} is configured
                </span>
              </div>
            )}
          </div>
        </DialogDescription>

        <div className="px-5 pb-4 bg-bolt-elements-background-depth-2 flex gap-2 justify-between">
          <div>
            {configured && (
              <DialogButton type="danger" onClick={handleClear}>
                Clear Key
              </DialogButton>
            )}
          </div>
          <div className="flex gap-2">
            <DialogButton type="secondary" onClick={onClose}>
              Cancel
            </DialogButton>
            <DialogButton type="primary" onClick={handleSave}>
              Save
            </DialogButton>
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
