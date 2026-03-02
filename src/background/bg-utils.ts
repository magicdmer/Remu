import {
  createGist,
  getGist,
  editGist,
  GistData,
  REMU_SYNC_FILENAME,
  GistDataRsp,
} from './syncServiceSW';

import {
  STORAGE_TOKEN,
  STORAGE_GIST_ID,
  STORAGE_GIST_UPDATE_TIME,
  STORAGE_TAGS,
  STORAGE_REPO,
  IS_UPDATE_LOCAL,
  STORAGE_SETTINGS,
  STORAGE_NOTES,
} from '../typings';

import { DEFAULT_SYNCHRONIZING_DELAY } from '../constants';

// --- Re-implement utilities to avoid importing 'antd' ---

export const syncStoragePromise = {
  get: (keys: string | string[] | Object | null) =>
    new Promise((resolve, reject) => {
      chrome.storage.sync.get(keys, (items) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(err);
        } else {
          resolve(items);
        }
      });
    }),
  set: (items: Object) =>
    new Promise((resolve, reject) => {
      chrome.storage.sync.set(items, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    }),
};

export const localStoragePromise = {
  get: (keys: string | string[] | Object | null) =>
    new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (items) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(err);
        } else {
          resolve(items);
        }
      });
    }),
  set: (items: Object) =>
    new Promise((resolve, reject) => {
      chrome.storage.local.set(items, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    }),
};

export function debounce(func: Function, wait: number = 500, immediate: boolean = false) {
  let timeout: any;
  return function(this: any) {
    const context = this;
    const args = arguments;
    const later = function() {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}

export function genUniqueKey(): string {
  return (
    Date.now()
      .toString()
      .slice(6) +
    Math.random()
      .toString()
      .slice(2, 8)
  );
}

// --- Background Logic ---

const setBrowseAction = ({ title = '', text = '' }) => {
  (chrome as any).action.setTitle({ title }); // V3 uses chrome.action
  (chrome as any).action.setBadgeText({ text });
  (chrome as any).action.setBadgeBackgroundColor({ color: [0, 0, 0, 0] });
};

export const initGist = () => {
  syncStoragePromise.get([STORAGE_TOKEN, STORAGE_GIST_ID]).then((result) => {
    const token = (result as any)[STORAGE_TOKEN];
    const gistId = (result as any)[STORAGE_GIST_ID];
    if (token && !gistId) {
      createGist('init gist', token).then(({ data }: GistDataRsp) => {
        const gistId = data.id;
        const updateTime = data.updated_at;
        return syncStoragePromise.set({
          [STORAGE_GIST_UPDATE_TIME]: updateTime,
          [STORAGE_GIST_ID]: gistId,
        });
      });
    }
  });
};

export interface ISyncInfo {
  token: string;
  gistId: string;
  updateAt?: string;
  settings?: any;
}

export const initEnv = async () => {
  return syncStoragePromise
    .get({
      [STORAGE_TOKEN]: '',
      [STORAGE_GIST_ID]: '',
      [STORAGE_GIST_UPDATE_TIME]: '',
      [STORAGE_SETTINGS]: { synchronizingDelay: DEFAULT_SYNCHRONIZING_DELAY },
    })
    .then<ISyncInfo>((results) => {
      const { token, gistId, updateAt, settings } = results as any;
      // We don't set window globals here anymore. 
      // The caller should use the returned values.
      return { token, gistId, updateAt, settings };
    });
};

export const checkSync = async (info: ISyncInfo) => {
  const { token, gistId, updateAt } = info;
  if (token && gistId) {
    return getGist({ gistId, token }).then(({ data }) => {
      const gistUpdateAt = data.updated_at;
      if (!updateAt || updateAt < gistUpdateAt) { // Handle case where updateAt is empty
        updateLocal(data);
        console.log('remu: update local');
      } else if (updateAt > gistUpdateAt) {
        updateGist(info);
        console.log('remu: update gist');
      } else {
        console.log('remu: up to date');
      }
    });
  } else {
    return Promise.resolve();
  }
};

export const updateGist = ({ token, gistId, updateAt }: ISyncInfo) => {
  setBrowseAction({ title: 'update Gist', text: '...' });
  return localStoragePromise
    .get([STORAGE_TAGS, STORAGE_REPO, STORAGE_NOTES])
    .then((results) => {
      const { tags, repoWithTags, repoWithNotes } = results as any;

      if (tags && repoWithTags) {
        const data = { tags, repoWithTags, repoWithNotes };
        const content = JSON.stringify(data);
        return editGist(content, gistId, token).then(
          ({ data }: GistDataRsp) => {
            syncStoragePromise
              .set({
                [STORAGE_GIST_UPDATE_TIME]: data.updated_at,
              })
              .catch((errors) => {
                (chrome as any).action.setBadgeBackgroundColor({
                  color: [255, 0, 0, 255],
                });
              })
              .finally(() => {
                setBrowseAction({});
              });
          },
        );
      }

      return null;
    });
};

export const updateGistDebounce = debounce(updateGist);

export const updateLocal = (data: GistData) => {
  setBrowseAction({ title: 'update Local', text: '...' });
  
  // Need to safely parse content, check if file exists
  if (!data.files[REMU_SYNC_FILENAME]) {
    setBrowseAction({});
    return Promise.reject('No sync file found');
  }

  const content = data.files[REMU_SYNC_FILENAME].content;
  let _data;
  try {
    _data = JSON.parse(content);
  } catch (e) {
    return Promise.reject(e);
  }
  const { tags, repoWithTags, repoWithNotes } = _data;
  const setNewTagsAndRepoWithTags = localStoragePromise.set({
    [STORAGE_REPO]: repoWithTags,
    [STORAGE_NOTES]: repoWithNotes,
    [STORAGE_TAGS]: tags,
    [IS_UPDATE_LOCAL]: genUniqueKey(),
  });

  const setUpdateAt = syncStoragePromise.set({
    [STORAGE_GIST_UPDATE_TIME]: data.updated_at,
  });

  return Promise.all([setNewTagsAndRepoWithTags, setUpdateAt])
    .catch((errors) => {
      (chrome as any).action.setBadgeBackgroundColor({
        color: [255, 0, 0, 255],
      });
    })
    .finally(() => {
      setBrowseAction({});
    });
};
