import axios from 'axios';

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

export function unwrap(response) {
  return response.data.data;
}
