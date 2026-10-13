import axios from 'axios';

/**
 * Prefer relative "/api" so Create React App's package.json "proxy"
 * (http://localhost:5000) forwards requests and avoids CORS issues.
 * Override with REACT_APP_API_URL only when needed (e.g. production).
 */
const BASE_URL =
    process.env.REACT_APP_API_URL ||
    process.env.VITE_API_URL ||
    '/api';

const API = axios.create({
    baseURL: BASE_URL,
    timeout: 20000,
});

API.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers = config.headers || {};
            config.headers.Authorization = `Bearer ${token}`;
        }

        if (config.data instanceof FormData) {
            if (config.headers) {
                delete config.headers['Content-Type'];
                delete config.headers['content-type'];
            }
        } else if (config.data && typeof config.data === 'object') {
            config.headers = config.headers || {};
            if (!config.headers['Content-Type'] && !config.headers['content-type']) {
                config.headers['Content-Type'] = 'application/json';
            }
        }

        return config;
    },
    (error) => Promise.reject(error)
);

API.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('role');
        }
        if (error.response) {
            const d = error.response.data || {};
            if (d.code === 'IP_BLOCKED' || d.code === 'ACCOUNT_LOCKED') {
                error.message = d.message || 'Access blocked. Contact an administrator.';
            } else if (d.message) {
                error.message = d.message;
            }
        } else if (!error.response) {
            error.message =
                error.code === 'ECONNABORTED'
                    ? 'Request timed out. Is the backend running on port 5000?'
                    : 'Cannot reach the server. Start the backend (npm run dev in backend/) and ensure MySQL is running.';
        }
        return Promise.reject(error);
    }
);

export default API;
