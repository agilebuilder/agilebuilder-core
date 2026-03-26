<template>
  <div class="app-shell">
    <header class="app-header">
      <div>
        <router-link to="/" class="brand-zone">
          <img class="brand-mark" src="/logo.png" alt="AgileBuilder logo" />
          <div>
            <h1>{{ t('app.brand') }}</h1>
            <p class="brand-subtitle">{{ t('app.brandEyebrow') }}</p>
          </div>
        </router-link>
      </div>
    </header>

    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  position: sticky;
  top: 0;
  z-index: 100;
}

.app-header > div {
  max-width: 1400px;
  margin: 0 auto;
  padding: 16px 24px;
}

.brand-zone {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.brand-zone:hover {
  opacity: 0.8;
}

.brand-mark {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
  object-fit: contain;
}

.brand-zone h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text);
}

.brand-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.app-main {
  flex: 1;
}
</style>
