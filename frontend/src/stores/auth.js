import { defineStore } from 'pinia';
import http from '../api/http';
import { clearAuthStorage } from '../utils/authStorage';
import { useProfileStore } from './profile';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    accessToken: localStorage.getItem('accessToken'),
  }),
  getters: {
    isAdmin: (s) => s.user?.role === 'admin',
  },
  actions: {
    async login(email, password) {
      const { data } = await http.post('/auth/login', {
        email: String(email || '').trim(),
        password: String(password || ''),
      });
      this.user = data.user;
      this.accessToken = data.accessToken;
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('accessToken', data.accessToken);
      const profileStore = useProfileStore();
      profileStore.hydrateFromCache();
      await profileStore.fetch().catch(() => {});
    },
    logout() {
      const userId = this.user?.id;
      this.user = null;
      this.accessToken = null;
      clearAuthStorage(userId);
      useProfileStore().reset();
    },
  },
});
