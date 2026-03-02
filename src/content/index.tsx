import * as React from 'react';
import * as ReactDOM from 'react-dom';
import RepoTags from './RepoTags';
import { localStoragePromise, syncStoragePromise } from '../utils';
import {
  STORAGE_TAGS,
  STORAGE_REPO,
  STORAGE_TOKEN,
  STORAGE_NOTES,
  STORAGE_SETTINGS,
} from '../typings';
// import createToken from './createToken';
import './index.less';
import { DEFAULT_CASE_SENSITIVITY } from '../constants';

const NEW_TOKEN_URL = 'https://github.com/settings/tokens/new';

let cachedStorage = null;

const getStorage = async () => {
  if (cachedStorage) return cachedStorage;
  
  const result = await syncStoragePromise.get({
    [STORAGE_TOKEN]: '',
    [STORAGE_SETTINGS]: {
      caseSensitivity: DEFAULT_CASE_SENSITIVITY,
    },
  });
  
  cachedStorage = result;
  return result;
};

const ROOT_ID = 'remu-injection-root';
let isInjecting = false;

const injectApp = async () => {
  if (isInjecting) return;
  if (document.getElementById(ROOT_ID)) return;

  isInjecting = true;
  try {
    const href = location.href;
    const result = await getStorage();

    // Double check if already injected
    if (document.getElementById(ROOT_ID)) {
      return;
    }

    // Try multiple selectors for the navigation bar
    const selectors = [
      '.UnderlineNav-body',
      '#repository-container-header nav ul',
      'nav[aria-label="Repository"] ul',
      '.js-repo-nav ul',
      // New Github Header structure
      '.AppHeader-globalBar-start',
      'div[data-component="Header"] nav ul'
    ];

    let repoTitleEl = null;
    for (const sel of selectors) {
      repoTitleEl = document.querySelector(sel);
      if (repoTitleEl) break;
    }

    if (!repoTitleEl) {
      // If we can't find the nav bar, we can't inject.
      return;
    }


    const token = result[STORAGE_TOKEN];
    const caseSensitivity = result[STORAGE_SETTINGS].caseSensitivity;

    if (href.startsWith(NEW_TOKEN_URL)) {
      if (!token) {
        // use create by url now
        // createToken();
      } else {
        // tslint:disable-next-line:no-console
        console.log('Remu: have token for Remu, no need to create a new token.');
      }
    }

    const userIdMeta = document.querySelector('meta[name="user-login"]');
    const userId = userIdMeta ? userIdMeta.getAttribute('content') : null;

    const isLogin = !!userId;

    if (isLogin) {
      const results = await localStoragePromise.get([STORAGE_TAGS, STORAGE_REPO, STORAGE_NOTES]);

      // Check again before rendering
      if (document.getElementById(ROOT_ID)) return;

      const {
        tags = [],
        repoWithTags = {},
        repoWithNotes = {},
      } = results as any;

      const repoIdMeta = document.querySelector('meta[name="octolytics-dimension-repository_id"]');
      const repoNwoMeta = document.querySelector('meta[name="octolytics-dimension-repository_nwo"]');

      if (!repoIdMeta || !repoNwoMeta) return;

      const repoId = repoIdMeta.getAttribute('content');
      const repoNwo = repoNwoMeta.getAttribute('content');

      const RepoTagsProps = {
        tags,
        token,
        caseSensitivity,
        repoWithTags,
        repoWithNotes,
        repoId,
        repoNwo,
      };

      // Try to append to ul/ol if possible, or just appendChild if it's a div
      if (repoTitleEl.tagName === 'UL' || repoTitleEl.tagName === 'OL') {
        const root = document.createElement('li');
        root.className = 'd-flex';
        root.id = ROOT_ID;
        repoTitleEl.appendChild(root);
        ReactDOM.render(<RepoTags {...RepoTagsProps} />, root);
      } else {
        // For div containers, use a div or span
        const root = document.createElement('div');
        root.className = 'd-flex';
        root.id = ROOT_ID;
        // Ensure it doesn't break layout
        root.style.alignItems = 'center';
        repoTitleEl.appendChild(root);
        ReactDOM.render(<RepoTags {...RepoTagsProps} />, root);
      }
    }
  } catch (e) {
    // tslint:disable-next-line:no-console
    console.error('Remu: injectApp failed', e);
  } finally {
    isInjecting = false;
  }
};


// Initial injection
document.addEventListener('DOMContentLoaded', injectApp);

// Support for GitHub SPA navigation (Turbo, Pjax)
document.addEventListener('pjax:end', injectApp);
document.addEventListener('turbo:render', injectApp);

// Fallback: Poll for the element in case of async loading or missed events
let timer = null;
const observer = new MutationObserver((mutations) => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    if (!document.getElementById(ROOT_ID)) {
      injectApp();
    }
  }, 100);
});

const startObserver = () => {
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  } else {
    // If body is not available, wait for DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body) {
        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
      }
    });
  }
};

startObserver();

// Periodic check for extreme cases (race conditions)
setInterval(() => {
  if (!document.getElementById(ROOT_ID)) {
    // Only try to inject if we are on a repo page
    const repoIdMeta = document.querySelector('meta[name="octolytics-dimension-repository_id"]');
    if (repoIdMeta) {
      injectApp();
    }
  }
}, 2000);

