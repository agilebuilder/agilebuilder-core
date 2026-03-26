import { apiClient, unwrap } from './client.js';

export const resourcesAPI = {
  list(params = {}) {
    return apiClient.get('/resources', { params }).then(unwrap);
  },
  summary() {
    return apiClient.get('/resources/summary').then(unwrap);
  },
  getById(id) {
    return apiClient.get(`/resources/${id}`).then(unwrap);
  },
  update(id, payload) {
    return apiClient.put(`/resources/${id}`, payload).then(unwrap);
  },
  remove(id) {
    return apiClient.delete(`/resources/${id}`).then(unwrap);
  },
  createTemplate(payload) {
    return apiClient.post('/templates', payload).then(unwrap);
  },
  updateTemplate(name, payload) {
    return apiClient.put(`/templates/${encodeURIComponent(name)}`, payload).then(unwrap);
  },
  createDoc(payload) {
    return apiClient.post('/docs', payload).then(unwrap);
  },
  updateDoc(id, payload) {
    return apiClient.put(`/docs/${id}`, payload).then(unwrap);
  },
};
