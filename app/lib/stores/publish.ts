import { atom } from 'nanostores';

export type PublishStatus = 'idle' | 'publishing' | 'success' | 'error';

export interface PublishState {
  status: PublishStatus;
  url: string | null;
  error: string | null;
}

export const publishState = atom<PublishState>({
  status: 'idle',
  url: null,
  error: null,
});

export function setPublishStatus(status: PublishStatus) {
  publishState.set({
    ...publishState.get(),
    status,
  });
}

export function setPublishSuccess(url: string) {
  publishState.set({
    status: 'success',
    url,
    error: null,
  });
}

export function setPublishError(error: string) {
  publishState.set({
    status: 'error',
    url: null,
    error,
  });
}

export function resetPublishState() {
  publishState.set({
    status: 'idle',
    url: null,
    error: null,
  });
}
