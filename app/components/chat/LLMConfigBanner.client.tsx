import { useStore } from '@nanostores/react';
import { LLM_ERROR_CODES } from '~/lib/llm-errors';
import {
  clearLLMError,
  errorIsRetryable,
  errorRequiresSettings,
  getErrorMessage,
  llmErrorStore,
} from '~/lib/stores/llm-error';
import { isProviderConfigured } from '~/lib/stores/providers';
import { classNames } from '~/utils/classNames';

interface LLMConfigBannerProps {
  onOpenSettings: () => void;
  onRetry?: () => void;
}

/**
 * Banner component that displays LLM configuration status and errors.
 * Shows when no provider is configured or when an LLM error occurs.
 */
export function LlmConfigBanner({ onOpenSettings, onRetry }: LLMConfigBannerProps) {
  const configured = useStore(isProviderConfigured);
  const { error } = useStore(llmErrorStore);

  // show "not configured" banner if no provider is set up
  if (!configured && !error) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 mb-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg">
        <div className="i-ph:warning-circle text-xl text-amber-500" />
        <div className="flex-1 text-sm text-bolt-elements-textSecondary">
          <span className="font-medium text-bolt-elements-textPrimary">No LLM configured</span>
          <span className="mx-1">—</span>
          <span>Add your API key in Settings to start building</span>
        </div>
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-bolt-elements-button-primary-background hover:bg-bolt-elements-button-primary-backgroundHover rounded-md transition-colors"
        >
          <div className="i-ph:gear text-base" />
          Open Settings
        </button>
      </div>
    );
  }

  // show error banner if there's an LLM error
  if (error) {
    const message = getErrorMessage(error);
    const needsSettings = errorRequiresSettings(error);
    const canRetry = errorIsRetryable(error);
    const isNoConfig = error.code === LLM_ERROR_CODES.NO_LLM_CONFIG;
    const isInvalidKey = error.code === LLM_ERROR_CODES.INVALID_API_KEY;
    const isModelError = error.code === LLM_ERROR_CODES.MODEL_ERROR;
    const isRateLimit = error.code === LLM_ERROR_CODES.RATE_LIMIT;

    // choose icon based on error type
    let iconClass = 'i-ph:warning-circle';

    if (isNoConfig) {
      iconClass = 'i-ph:key';
    } else if (isInvalidKey) {
      iconClass = 'i-ph:key-hole';
    } else if (isModelError) {
      iconClass = 'i-ph:cube';
    } else if (isRateLimit) {
      iconClass = 'i-ph:clock';
    }

    // choose color based on severity
    const iconColor = isRateLimit ? 'text-amber-500' : 'text-red-500';
    const borderColor = isRateLimit ? 'border-amber-500/30' : 'border-red-500/30';
    const bgColor = isRateLimit ? 'bg-amber-500/5' : 'bg-red-500/5';

    return (
      <div className={classNames('flex items-start gap-3 px-4 py-3 mb-2 rounded-lg border', bgColor, borderColor)}>
        <div className={classNames(iconClass, 'text-xl mt-0.5', iconColor)} />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-bolt-elements-textPrimary font-medium">
            {isNoConfig && 'No LLM Configured'}
            {isInvalidKey && `Invalid API Key${error.provider ? ` (${error.provider})` : ''}`}
            {isModelError && `Model Error${error.model ? `: ${error.model}` : ''}`}
            {isRateLimit && 'Rate Limit Exceeded'}
            {!isNoConfig && !isInvalidKey && !isModelError && !isRateLimit && 'LLM Error'}
          </div>
          <div className="text-sm text-bolt-elements-textSecondary mt-0.5">{message}</div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {needsSettings && (
            <button
              onClick={() => {
                clearLLMError();
                onOpenSettings();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-bolt-elements-button-primary-background hover:bg-bolt-elements-button-primary-backgroundHover rounded-md transition-colors"
            >
              <div className="i-ph:gear text-base" />
              Settings
            </button>
          )}
          {canRetry && onRetry && (
            <button
              onClick={() => {
                clearLLMError();
                onRetry();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-bolt-elements-textPrimary bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-md transition-colors"
            >
              <div className="i-ph:arrow-clockwise text-base" />
              Retry
            </button>
          )}
          <button
            onClick={clearLLMError}
            className="p-1.5 text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary transition-colors"
            title="Dismiss"
          >
            <div className="i-ph:x text-base" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
