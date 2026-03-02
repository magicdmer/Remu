// import * as Sentry from '@sentry/browser';
import { createGist } from './syncServiceSW';
import { syncStoragePromise, initEnv, checkSync, updateGist, ISyncInfo } from './bg-utils';
import {
  STORAGE_TOKEN,
  STORAGE_GIST_ID,
  STORAGE_GIST_UPDATE_TIME,
  STORAGE_REPO,
  IS_UPDATE_LOCAL,
  IMessageAction,
  IResponseMsg,
} from '../typings';

// if (process.env.NODE_ENV !== 'development') {
//   Sentry.init({
//     dsn: 'https://238e73db89cb46929d35b7f1b7c6b181@sentry.io/1510135',
//   });
// }

(chrome as any).action.onClicked.addListener(function() {
  const index = chrome.runtime.getURL('view-tab.html');
  chrome.tabs.query({ url: index }, function(tabs) {
    if (tabs.length) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: index });
    }
  });
});

let debounceTimer: any = null;

chrome.storage.onChanged.addListener(function(changes, areaName) {
  if (areaName === 'sync') {
    // only add token
    if (changes[STORAGE_TOKEN]) {
      const token = changes[STORAGE_TOKEN].newValue;
      
      syncStoragePromise.get(STORAGE_GIST_ID).then((res: any) => {
        const currentGistId = res[STORAGE_GIST_ID];
        
        if (token && !currentGistId) {
          createGist('create gist', token).then(({ data }) => {
            const gistId = data.id;
            const updateTime = data.updated_at;
            syncStoragePromise
              .set({
                [STORAGE_GIST_ID]: gistId,
                [STORAGE_GIST_UPDATE_TIME]: updateTime,
              });
          }).catch((err) => {
            console.error('Remu: Failed to create gist', err);
          });
        }
      });
    }
  }

  if (areaName === 'local') {
    if (changes[STORAGE_REPO] && !changes[IS_UPDATE_LOCAL]) {
      initEnv().then((info) => {
        if (info.token && info.gistId) {
           if (debounceTimer) clearTimeout(debounceTimer);
           
           const delay = (info.settings && info.settings.synchronizingDelay) || 60000; // Default from constants?
           
           debounceTimer = setTimeout(() => {
             updateGist(info);
           }, delay);
        }
      });
    }
  }
});

initEnv().then(checkSync).catch((err) => {
  console.error('Remu: Sync check failed during initialization', err);
});

chrome.runtime.onMessage.addListener(function(
  request: IMessageAction,
  sender,
  sendResponse,
) {
  const { type, payload } = request;
  let message: IResponseMsg;
  if (type === 'refresh') {
    initEnv().then((info) => {
      checkSync(info).then(() => {
         message = { status: 'success' };
         sendResponse(message);
      }).catch(() => {
         message = { status: 'error' }; // Or some error handling
         sendResponse(message);
      });
    });
    return true;
  }
  return true;
});
