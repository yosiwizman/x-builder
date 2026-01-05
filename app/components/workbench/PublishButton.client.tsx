import { useStore } from '@nanostores/react';
import { memo, useCallback } from 'react';
import { toast } from 'react-toastify';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import {
  publishState,
  setPublishStatus,
  setPublishSuccess,
  setPublishError,
  resetPublishState,
} from '~/lib/stores/publish';
import { workbenchStore } from '~/lib/stores/workbench';

interface PublishButtonProps {
  className?: string;
}

export const PublishButton = memo(({ className }: PublishButtonProps) => {
  const { status, url } = useStore(publishState);
  const isPublishing = status === 'publishing';

  const handlePublish = useCallback(async () => {
    const files = workbenchStore.files.get();

    if (!files || Object.keys(files).length === 0) {
      toast.error('No files to publish');
      return;
    }

    // convert files to publishable format (only file contents, not directories)
    const publishableFiles: Record<string, string> = {};

    for (const [path, dirent] of Object.entries(files)) {
      if (dirent?.type === 'file' && dirent.content) {
        publishableFiles[path] = dirent.content;
      }
    }

    if (Object.keys(publishableFiles).length === 0) {
      toast.error('No file content to publish');
      return;
    }

    setPublishStatus('publishing');
    toast.info('Publishing project...');

    try {
      const response = await fetch('/api/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ files: publishableFiles }),
      });

      const data = (await response.json()) as { url?: string; error?: string; success?: boolean };

      if (!response.ok) {
        throw new Error(data.error || 'Publish failed');
      }

      const publishUrl = data.url || '';
      setPublishSuccess(publishUrl);
      toast.success(
        <div>
          Published successfully!
          <br />
          <a href={publishUrl} target="_blank" rel="noopener noreferrer" className="underline">
            {publishUrl}
          </a>
        </div>,
        { autoClose: false },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setPublishError(message);
      toast.error(`Publish failed: ${message}`);
    }
  }, []);

  const handleViewDeployment = useCallback(() => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [url]);

  const handleReset = useCallback(() => {
    resetPublishState();
  }, []);

  if (status === 'success' && url) {
    return (
      <div className={className}>
        <PanelHeaderButton className="text-sm text-green-500" onClick={handleViewDeployment}>
          <div className="i-ph:globe" />
          View Site
        </PanelHeaderButton>
        <PanelHeaderButton className="text-sm ml-1" onClick={handleReset}>
          <div className="i-ph:x" />
        </PanelHeaderButton>
      </div>
    );
  }

  return (
    <PanelHeaderButton className={`text-sm ${className || ''}`} onClick={handlePublish} disabled={isPublishing}>
      {isPublishing ? (
        <>
          <div className="i-svg-spinners:90-ring-with-bg" />
          Publishing...
        </>
      ) : (
        <>
          <div className="i-ph:cloud-arrow-up" />
          Publish
        </>
      )}
    </PanelHeaderButton>
  );
});
