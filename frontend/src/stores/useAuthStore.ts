import { create } from 'zustand';
import axios from 'axios';

const TOKEN_KEY = 'pump-auth-token';

interface AuthState {
  token: string | null;
  authRequired: boolean | null; // null = not checked yet
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  checkAuthStatus: () => Promise<void>;
}

const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem(TOKEN_KEY),
  authRequired: null,

  login: async (username: string, password: string): Promise<boolean> => {
    try {
      const res = await axios.post('/api/auth/login', { username, password });
      const token = res.data.token as string;
      localStorage.setItem(TOKEN_KEY, token);
      set({ token, authRequired: true });
      return true;
    } catch {
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ token: null });
  },

  checkAuthStatus: async () => {
    try {
      const res = await axios.get('/api/auth/status');
      const required = res.data.auth_required as boolean;
      set({ authRequired: required });

      // If auth is required, validate existing token
      if (required) {
        const storedToken = localStorage.getItem(TOKEN_KEY);
        if (storedToken) {
          try {
            const check = await axios.get('/api/auth/check', {
              headers: { Authorization: `Bearer ${storedToken}` },
            });
            if (!check.data.authenticated) {
              localStorage.removeItem(TOKEN_KEY);
              set({ token: null });
            }
          } catch {
            localStorage.removeItem(TOKEN_KEY);
            set({ token: null });
          }
        }
      }
    } catch {
      // If status endpoint fails, assume no auth needed
      set({ authRequired: false });
    }
  },
}));

export default useAuthStore;
