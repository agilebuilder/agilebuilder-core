<template>
  <div class="page-shell home-page">
    <div v-if="successMessage" class="status-banner success">{{ successMessage }}</div>
    <div v-if="deleteTarget" class="modal-backdrop" @click="cancelDelete">
      <div class="confirm-dialog" @click.stop>
        <h3>{{ t('app.confirmDeleteTitle') }}</h3>
        <p>{{ t('app.confirmDelete', { name: deleteTarget.name }) }}</p>
        <div class="confirm-dialog-actions">
          <button class="ghost-button" @click="cancelDelete">{{ t('app.cancel') }}</button>
          <button class="danger-button" @click="confirmDelete">{{ t('app.delete') }}</button>
        </div>
      </div>
    </div>
    <section class="kpi-strip">
      <article class="kpi-item kpi-item-primary">
        <span>{{ t('app.summaryResources') }}</span>
        <strong>{{ summary.total }}</strong>
      </article>
      <article class="kpi-item">
        <span>{{ t('app.summaryTemplates') }}</span>
        <strong>{{ summary.templates }}</strong>
      </article>
      <article class="kpi-item">
        <span>{{ t('app.summaryDocs') }}</span>
        <strong>{{ summary.docs }}</strong>
      </article>
      <article class="kpi-item">
        <span>{{ t('app.summaryClones') }}</span>
        <strong>{{ summary.totalCloneCount }}</strong>
      </article>
    </section>

    <section class="console-panel">
      <div class="console-toolbar">
        <div class="console-toolbar-copy">
          <h2>{{ t('app.resourceList') }}</h2>
          <p>{{ t('app.resourceListSubtitle') }}</p>
        </div>
        <div class="console-toolbar-controls">
          <button class="secondary-button" @click="refreshData">{{ t('app.refresh') }}</button>
          <button class="primary-button" @click="goToCreate('doc')">{{ t('app.createDoc') }}</button>
          <button class="primary-button" @click="goToCreate('template')">{{ t('app.createTemplate') }}</button>
        </div>
      </div>

      <div class="filter-toolbar">
        <input
          v-model="searchKeyword"
          class="search-input search-input-flat"
          :placeholder="t('app.searchPlaceholder')"
        />
        <div class="filter-segment filter-segment-flat">
          <button
            v-for="option in filterOptions"
            :key="option.value"
            class="segment-button"
            :class="{ active: activeFilter === option.value }"
            @click="activeFilter = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div v-if="loading" class="empty-state">{{ t('app.loading') }}</div>
      <div v-else-if="errorMessage" class="empty-state danger">{{ errorMessage }}</div>
      <div v-else-if="resources.length === 0" class="empty-state">
        {{ searchKeyword ? t('app.searchEmpty') : t('app.emptyDescription') }}
      </div>
      <div v-else class="resource-table-shell">
        <div class="resource-table-header">
          <span>{{ t('resource.name') }}</span>
          <span>{{ t('app.typeLabel') }}</span>
          <span>{{ t('resource.tags') }}</span>
          <span>{{ t('app.updatedLabel') }}</span>
          <span>{{ t('app.actions') }}</span>
        </div>
        <div class="resource-table-body">
          <div
            v-for="resource in resources"
            :key="resource.id"
            class="resource-row"
          >
            <div class="resource-row-main">
              <strong>{{ resource.name }}</strong>
              <p>{{ resource.description || t('app.noDescription') }}</p>
            </div>
            <div class="resource-row-type">
              <span class="type-pill type-pill-flat">{{ getResourceTypeLabel(resource.type, t) }}</span>
            </div>
            <div class="resource-row-tags">
              <span v-for="tag in getLimitedTags(resource.tags)" :key="`${resource.id}-${tag}`" class="soft-tag soft-tag-flat">{{ tag }}</span>
              <span v-if="getLimitedTags(resource.tags).length === 0" class="muted-placeholder">-</span>
            </div>
            <div class="resource-row-time">
              <span>{{ formatShortResourceDate(resource.updated_at) }}</span>
              <small>#{{ resource.id }}</small>
            </div>
            <div class="resource-row-actions">
              <button class="action-button" @click="goToDetails(resource.id)" :title="t('app.view')">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 8s2-4 7-4 7 4 7 4-2 4-7 4-7-4-7-4z"/>
                  <circle cx="8" cy="8" r="2"/>
                </svg>
              </button>
              <button class="action-button" @click="goToEdit(resource.id)" :title="t('app.edit')">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 2l3 3-9 9H2v-3l9-9z"/>
                </svg>
              </button>
              <button class="action-button danger" @click="handleDelete(resource)" :title="t('app.delete')">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M2 4h12M5 4V2h6v2M3 4v10h10V4"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { resourcesAPI } from '../api/resources.js';
import { getResourceTypeLabel, getResourceTypeOptions } from '../api/resource-types.js';
import { formatShortResourceDate, getErrorMessage, parseResourceTags } from '../api/resource-utils.js';

const { t } = useI18n();
const router = useRouter();

const loading = ref(true);
const errorMessage = ref('');
const successMessage = ref('');
const deleteTarget = ref(null);
const summary = ref({
  total: 0,
  templates: 0,
  docs: 0,
  totalCloneCount: 0,
});
const resources = ref([]);
const activeFilter = ref('all');
const searchKeyword = ref('');

const filterOptions = ref([]);
let searchTimer = null;

function syncFilterOptions() {
  filterOptions.value = getResourceTypeOptions(t);
}

function getLimitedTags(tags) {
  return parseResourceTags(tags).slice(0, 3);
}

async function refreshData() {
  loading.value = true;
  errorMessage.value = '';

  try {
    const params = {};
    if (activeFilter.value !== 'all') {
      params.type = activeFilter.value;
    }
    if (searchKeyword.value.trim()) {
      params.keyword = searchKeyword.value.trim();
    }

    const [summaryData, listData] = await Promise.all([
      resourcesAPI.summary(),
      resourcesAPI.list(params),
    ]);

    summary.value = summaryData;
    resources.value = listData;
  } catch (error) {
    errorMessage.value = t('app.loadFailed', {
      error: getErrorMessage(error, t('app.apiError')),
    });
  } finally {
    loading.value = false;
  }
}

function scheduleRefresh() {
  if (searchTimer) {
    window.clearTimeout(searchTimer);
  }

  searchTimer = window.setTimeout(() => {
    refreshData();
  }, 250);
}

function goToDetails(id) {
  router.push({ name: 'resource-detail', params: { id } });
}

function goToEdit(id) {
  router.push({ name: 'resource-edit', params: { id } });
}

function goToCreate(type) {
  router.push({ name: 'resource-create', query: { type } });
}

async function handleDelete(resource) {
  deleteTarget.value = resource;
}

function cancelDelete() {
  deleteTarget.value = null;
}

async function confirmDelete() {
  if (!deleteTarget.value) {
    return;
  }

  try {
    await resourcesAPI.remove(deleteTarget.value.id);
    successMessage.value = t('app.deleteSuccess');
    deleteTarget.value = null;
    await refreshData();
  } catch (error) {
    errorMessage.value = t('app.deleteFailed', {
      error: getErrorMessage(error, t('app.apiError')),
    });
  }
}

watch(activeFilter, scheduleRefresh);
watch(searchKeyword, scheduleRefresh);

onMounted(() => {
  syncFilterOptions();
  successMessage.value = window.history.state?.resourceMessage || '';
  refreshData();
});

onBeforeUnmount(() => {
  if (searchTimer) {
    window.clearTimeout(searchTimer);
  }
});
</script>
