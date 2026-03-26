import { createRouter, createWebHistory } from 'vue-router';
import HomePage from './pages/HomePage.vue';
import ResourceFormPage from './pages/ResourceFormPage.vue';
import ResourceDetailPage from './pages/ResourceDetailPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomePage,
    },
    {
      path: '/resources/create',
      name: 'resource-create',
      component: ResourceFormPage,
    },
    {
      path: '/resources/:id',
      name: 'resource-detail',
      component: ResourceDetailPage,
    },
    {
      path: '/resources/:id/edit',
      name: 'resource-edit',
      component: ResourceFormPage,
    },
  ],
});
