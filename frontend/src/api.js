const API_URL = 'http://localhost:5000/api';

let accessToken = null;
let onTokenRefreshed = null;
let isRefreshing = false;
let refreshSubscribers = [];

function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token) {
  refreshSubscribers.map((cb) => cb(token));
  refreshSubscribers = [];
}

export const setAccessToken = (token) => {
  accessToken = token;
};

export const getAccessToken = () => accessToken;

export const getRefreshToken = () => localStorage.getItem('refreshToken');

export const setRefreshToken = (token) => {
  if (token) {
    localStorage.setItem('refreshToken', token);
  } else {
    localStorage.removeItem('refreshToken');
  }
};

export const registerOnTokenRefreshed = (callback) => {
  onTokenRefreshed = callback;
};

// Custom API wrapper around fetch
export async function apiRequest(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;

  options.headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (accessToken) {
    options.headers['Authorization'] = `Bearer ${accessToken}`;
  }

  try {
    let response = await fetch(url, options);

    // Enforce transparent refresh on 401 TOKEN_EXPIRED
    if (response.status === 401) {
      const cloneRes = response.clone();
      let errorData = {};
      try {
        errorData = await cloneRes.json();
      } catch (e) {
        // Not a JSON body
      }

      if (errorData.code === 'TOKEN_EXPIRED') {
        const refreshToken = getRefreshToken();

        if (!refreshToken) {
          throw new Error('SESSION_EXPIRED');
        }

        if (!isRefreshing) {
          isRefreshing = true;
          try {
            const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken }),
            });

            if (refreshResponse.ok) {
              const data = await refreshResponse.json();
              accessToken = data.accessToken;
              setRefreshToken(data.refreshToken);
              isRefreshing = false;

              // Notify subscribers
              onRefreshed(data.accessToken);

              // Notify main app state if callback registered
              if (onTokenRefreshed) {
                onTokenRefreshed({
                  accessToken: data.accessToken,
                  refreshToken: data.refreshToken,
                });
              }
            } else {
              isRefreshing = false;
              setRefreshToken(null);
              accessToken = null;
              throw new Error('SESSION_EXPIRED');
            }
          } catch (err) {
            isRefreshing = false;
            setRefreshToken(null);
            accessToken = null;
            throw new Error('SESSION_EXPIRED');
          }
        }

        // Return a promise that resolves when the token is refreshed
        return new Promise((resolve) => {
          subscribeTokenRefresh((newToken) => {
            options.headers['Authorization'] = `Bearer ${newToken}`;
            resolve(fetch(url, options));
          });
        });
      }
    }

    return response;
  } catch (err) {
    if (err.message === 'SESSION_EXPIRED') {
      // Dispatches custom event to notify React app to log out
      window.dispatchEvent(new Event('auth-session-expired'));
    }
    throw err;
  }
}
