<template>
  <div class="page-shell detail-page">
    <div v-if="showDeleteConfirm && resource" class="modal-backdrop" @click="showDeleteConfirm = false">
      <div class="confirm-dialog" @click.stop>
        <h3>{{ t('app.confirmDeleteTitle') }}</h3>
        <p>{{ t('app.confirmDelete', { name: resource.name }) }}</p>
        <div class="confirm-dialog-actions">
          <button class="ghost-button" @click="showDeleteConfirm = false">{{ t('app.cancel') }}</button>
          <button class="danger-button" @click="confirmDelete">{{ t('app.delete') }}</button>
        </div>
      </div>
    </div>
    <section class="review-layout">
      <div class="review-main-panel">
        <div v-if="loading" class="empty-state">{{ t('app.loading') }}</div>
        <div v-else-if="errorMessage" class="empty-state danger">{{ errorMessage }}</div>
        <template v-else-if="resource">
          <div class="review-banner">
            <div class="review-banner-copy">
              <h2>{{ resource.name }}</h2>
              <p>{{ resource.description || t('app.noDescription') }}</p>
            </div>
            <div class="review-banner-actions">
              <button class="secondary-button" @click="goHome">{{ t('app.backToHome') }}</button>
              <button class="primary-button" @click="goEdit">{{ t('app.edit') }}</button>
            </div>
          </div>

          <div class="review-section">
            <h2>{{ t('app.details') }}</h2>
            <div class="review-grid">
              <div class="review-item">
                <label>{{ t('resource.name') }}</label>
                <span>{{ resource.name }}</span>
              </div>
              <div class="review-item">
                <label>{{ t('resource.tags') }}</label>
                <span>{{ parseResourceTags(resource.tags).join(' · ') || '-' }}</span>
              </div>
              <div class="review-item wide">
                <label>{{ t('resource.description') }}</label>
                <span>{{ resource.description || t('app.noDescription') }}</span>
              </div>
            </div>
          </div>

          <div class="review-section" v-if="resource.type === 'template'">
            <h2>{{ t('app.templateSectionTitle') }}</h2>
            <div class="review-grid">
              <div class="review-item"><label>{{ t('resource.gitUrl') }}</label><span>{{ resource.git_url }}</span></div>
              <div class="review-item"><label>{{ t('resource.branch') }}</label><span>{{ resource.branch }}</span></div>
              <div class="review-item"><label>{{ t('resource.cloneCount') }}</label><span>{{ resource.clone_count }}</span></div>
            </div>
          </div>

          <div class="review-section" v-else>
            <h2>{{ t('app.docSectionTitle') }}</h2>
            <div class="review-grid">
              <div class="review-item"><label>{{ t('resource.uri') }}</label><span>{{ resource.uri }}</span></div>
              <div class="review-item"><label>{{ t('resource.wordCount') }}</label><span>{{ resource.word_count }}</span></div>
              <div class="review-item wide"><label>{{ t('resource.content') }}</label><pre>{{ resource.content }}</pre></div>
            </div>
          </div>
        </template>
      </div>

      <aside class="review-side-panel" v-if="resource">
        <h3>{{ t('app.metadata') }}</h3>
        <div class="review-side-list">
          <div><label>ID</label><span>#{{ resource.id }}</span></div>
          <div><label>{{ t('app.typeLabel') }}</label><span>{{ getResourceTypeLabel(resource.type, t) }}</span></div>
          <div><label>{{ t('app.createdLabel') }}</label><span>{{ formatDate(resource.created_at) }}</span></div>
          <div><label>{{ t('app.updatedLabel') }}</label><span>{{ formatDate(resource.updated_at) }}</span></div>
        </div>
        <button class="danger-button" @click="handleDelete">{{ t('app.delete') }}</button>
      </aside>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { resourcesAPI } from '../api/resources.js';
import { getResourceTypeLabel } from '../api/resource-types.js';
import { formatFullResourceDate, getErrorMessage, parseResourceTags } from '../api/resource-utils.js';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const loading = ref(true);
const errorMessage = ref('');
const resource = ref(null);
const showDeleteConfirm = ref(false);

async function loadResource() {
  loading.value = true;
  errorMessage.value = '';

  try {
    resource.value = await resourcesAPI.getById(route.params.id);
  } catch (error) {
    errorMessage.value = t('app.loadFailed', {
      error: getErrorMessage(error, t('app.apiError')),
    });
  } finally {
    loading.value = false;
  }
}

function goHome() {
  router.push({ name: 'home' });
}

function goEdit() {
  router.push({ name: 'resource-edit', params: { id: route.params.id } });
}

async function handleDelete() {
  if (!resource.value) {
    return;
  }

  showDeleteConfirm.value = true;
}

async function confirmDelete() {
  if (!resource.value) {
    return;
  }

  try {
    await resourcesAPI.remove(resource.value.id);
    showDeleteConfirm.value = false;
    router.push({ name: 'home', state: { resourceMessage: t('app.deleteSuccess') } });
  } catch (error) {
    errorMessage.value = t('app.deleteFailed', {
      error: getErrorMessage(error, t('app.apiError')),
    });
  }
}

const formatDate = formatFullResourceDate;

onMounted(loadResource);
</script>
