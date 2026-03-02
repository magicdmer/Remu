const baseURL = 'https://api.github.com';

interface RequestOptions {
  headers?: Record<string, string>;
  body?: any;
}

const fetchRequest = async (url: string, options: RequestInit = {}) => {
  const fullUrl = url.startsWith('http') ? url : baseURL + url;
  const response = await fetch(fullUrl, options);
  
  if (!response.ok) {
    // Handle 401 specifically if needed, but we can't show UI in SW
    if (response.status === 401) {
      console.error('Remu: Unauthorized (401). Please check token.');
      // Optionally notify user via chrome.notifications
    }
    throw { response: { status: response.status, statusText: response.statusText } };
  }
  
  const data = await response.json();
  return { data };
};

export const request = {
  get: (url: string, config: { headers?: Record<string, string> } = {}) => {
    return fetchRequest(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
    });
  },
  post: (url: string, data: any, config: { headers?: Record<string, string> } = {}) => {
    return fetchRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
      body: JSON.stringify(data),
    });
  },
  patch: (url: string, data: any, config: { headers?: Record<string, string> } = {}) => {
    return fetchRequest(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
      body: JSON.stringify(data),
    });
  },
};
