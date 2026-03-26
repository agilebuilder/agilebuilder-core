import { createApp } from 'vue';
import { createI18n } from 'vue-i18n';
import App from './App.vue';
import { router } from './router.js';
import { settingsAPI } from './api/settings.js';
import messages from './locales/index.js';
import './styles.css';

function resolveBrowserLocale() {
  return typeof navigator !== 'undefined' && navigator.language === 'zh-CN'
    ? 'zh-CN'
    : 'en-US';
}

const i18n = createI18n({
  legacy: false,
  locale: resolveBrowserLocale(),
  fallbackLocale: 'en-US',
  messages,
});

async function bootstrap() {
  try {
    const settings = await settingsAPI.getUI();
    if (settings?.locale) {
      i18n.global.locale.value = settings.locale;
    }
  } catch {
    i18n.global.locale.value = resolveBrowserLocale();
  }

  createApp(App).use(router).use(i18n).mount('#app');
}

bootstrap();
