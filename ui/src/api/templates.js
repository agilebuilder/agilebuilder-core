import axios from 'axios';
import { resourcesAPI } from './resources.js';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

export const templatesAPI = {
  getAll: () => resourcesAPI.list({ type: 'template' }),
  getByName: () => Promise.reject(new Error('Use resourcesAPI.list or resources API detail endpoints instead.')),
  create: (data) => resourcesAPI.createTemplate(data),
  update: (name, data) => resourcesAPI.updateTemplate(name, data),
  delete: () => Promise.reject(new Error('Use resourcesAPI.remove(id) instead.')),
  search: (keyword) => resourcesAPI.list({ type: 'template', keyword }),
};
