import { apiClient, unwrap } from './client.js';

export const settingsAPI = {
  getUI() {
    return apiClient.get('/settings/ui').then(unwrap);
  },
};
