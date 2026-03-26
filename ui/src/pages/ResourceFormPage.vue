<template>
  <div class="page-shell form-page">
    <div v-if="toastMessage" class="toast-stack" role="status" aria-live="polite">
      <div class="toast toast-danger">
        <div class="toast-content">
          <strong>{{ t('app.saveFailed', { error: '' }).replace(/[:：]\s*$/, '') }}</strong>
          <span>{{ toastMessage }}</span>
        </div>
        <button type="button" class="toast-close" @click="hideToast" :aria-label="t('app.cancel')">×</button>
      </div>
    </div>
    <section class="form-layout">
      <aside class="form-sidebar">
        <div class="form-sidebar-block">
          <span class="sidebar-label">{{ t('app.typeLabel') }}</span>
          <strong>{{ form.type === 'template' ? t('app.templateType') : t('app.docType') }}</strong>
          <p>{{ form.type === 'template' ? t('app.templateCreateHint') : t('app.docCreateHint') }}</p>
        </div>
        <div class="form-sidebar-block">
          <span class="sidebar-label">{{ t('app.formGuideTitle') }}</span>
          <ul class="sidebar-list">
            <li>{{ t('app.formGuideLine1') }}</li>
            <li>{{ t('app.formGuideLine2') }}</li>
            <li>{{ t('app.formGuideLine3') }}</li>
          </ul>
        </div>
      </aside>

      <section class="console-panel">
        <div class="form-panel-header">
          <div class="form-panel-copy">
            <h2>{{ isEditMode ? t('app.formPageEditTitle') : t('app.formPageCreateTitle') }}</h2>
            <p>{{ isEditMode ? t('app.formPageEditSubtitle') : t('app.formPageCreateSubtitle') }}</p>
          </div>
        </div>
        <div v-if="successMessage" class="status-banner success">{{ successMessage }}</div>
        <div v-if="loading" class="empty-state">{{ t('app.loading') }}</div>
        <div v-else-if="loadErrorMessage" class="empty-state danger">{{ loadErrorMessage }}</div>
        <form v-else class="editor-form" @submit.prevent="handleSubmit">
          <label :class="{ 'field-error': Boolean(fieldErrors.type) }">
            <span><span class="required">*</span> {{ t('app.typeLabel') }}</span>
            <select v-model="form.type" :disabled="isEditMode">
              <option value="template">{{ t('app.templateType') }}</option>
              <option value="doc">{{ t('app.docType') }}</option>
            </select>
            <small>{{ t('app.typeHelp') }}</small>
            <span v-if="fieldErrors.type" class="field-error-message">{{ fieldErrors.type }}</span>
          </label>

          <label :class="{ 'field-error': Boolean(fieldErrors.name) }">
            <span><span class="required">*</span> {{ t('resource.name') }}</span>
            <input v-model="form.name" :placeholder="t('app.namePlaceholder')" required />
            <small>{{ t('app.nameHelp') }}</small>
            <span v-if="fieldErrors.name" class="field-error-message">{{ fieldErrors.name }}</span>
          </label>

          <label :class="{ 'field-error': Boolean(fieldErrors.description) }">
            <span>{{ t('resource.description') }}</span>
            <textarea v-model="form.description" rows="3" :placeholder="t('app.descriptionPlaceholder')"></textarea>
            <small>{{ t('app.descriptionHelp') }}</small>
            <span v-if="fieldErrors.description" class="field-error-message">{{ fieldErrors.description }}</span>
          </label>

          <template v-if="form.type === 'template'">
            <label :class="{ 'field-error': Boolean(fieldErrors.git_url) }">
              <span><span class="required">*</span> {{ t('resource.gitUrl') }}</span>
              <input v-model="form.git_url" :placeholder="t('app.gitUrlPlaceholder')" required />
              <small>{{ t('app.gitUrlHelp') }}</small>
              <span v-if="fieldErrors.git_url" class="field-error-message">{{ fieldErrors.git_url }}</span>
            </label>
            <label :class="{ 'field-error': Boolean(fieldErrors.branch) }">
              <span><span class="required">*</span> {{ t('resource.branch') }}</span>
              <input v-model="form.branch" :placeholder="t('app.branchPlaceholder')" required />
              <small>{{ t('app.branchHelp') }}</small>
              <span v-if="fieldErrors.branch" class="field-error-message">{{ fieldErrors.branch }}</span>
            </label>
          </template>

          <template v-else>
            <label :class="{ 'field-error': Boolean(fieldErrors.uri) }">
              <span><span class="required">*</span> {{ t('resource.uri') }}</span>
              <input v-model="form.uri" :placeholder="t('app.uriPlaceholder')" required />
              <small>{{ t('app.uriHelp') }}</small>
              <span v-if="fieldErrors.uri" class="field-error-message">{{ fieldErrors.uri }}</span>
            </label>
            <label :class="{ 'field-error': Boolean(fieldErrors.content) }">
              <span><span class="required">*</span> {{ t('resource.content') }}</span>
              <textarea v-model="form.content" rows="14" :placeholder="t('app.contentPlaceholder')" required></textarea>
              <small>{{ t('app.contentHelpExtended') }}</small>
              <span v-if="fieldErrors.content" class="field-error-message">{{ fieldErrors.content }}</span>
            </label>
          </template>

          <div class="form-field-group" :class="{ 'field-error': Boolean(fieldErrors.tags) }">
            <span class="form-field-label">{{ t('resource.tags') }}</span>
            <div v-if="tags.length > 0" class="tags-display-panel">
              <div class="tags-list">
                <span v-for="(tag, index) in tags" :key="index" class="tag-item">
                  {{ tag }}
                  <button type="button" @click.stop="removeTag(index)" class="tag-remove" :aria-label="t('app.removeTag')">×</button>
                </span>
              </div>
              <small>{{ t('app.tagsListHelp') }}</small>
            </div>
            <div class="tags-input-wrapper tags-input-standalone">
              <input
                v-model="tagInput"
                @keydown.enter.prevent="addTag"
                @keydown.comma.prevent="addTag"
                :placeholder="t('app.tagsHelp')"
              />
              <button type="button" class="secondary-button tag-add-button" @click="addTag">{{ t('app.addTag') }}</button>
            </div>
            <small>{{ t('app.tagsInputHelp') }}</small>
            <span v-if="fieldErrors.tags" class="field-error-message">{{ fieldErrors.tags }}</span>
          </div>

          <div class="form-actions">
            <button type="button" class="ghost-button" @click="goBack">{{ t('app.cancel') }}</button>
            <button type="submit" class="primary-button">{{ t('app.save') }}</button>
          </div>
        </form>
      </section>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { resourcesAPI } from '../api/resources.js';
import { buildPayload, createEmptyForm, mapResourceToForm, validateForm } from '../api/resource-form.js';
import { getErrorMessage, getFriendlyResourceError, parseResourceTags } from '../api/resource-utils.js';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const loading = ref(false);
const loadErrorMessage = ref('');
const errorMessage = ref('');
const successMessage = ref('');
const toastMessage = ref('');
const fieldErrors = ref({});
const form = ref(createEmptyForm(route.query.type === 'doc' ? 'doc' : 'template'));
const resource = ref(null);
const tags = ref([]);
const tagInput = ref('');
let toastTimer = null;

const isEditMode = computed(() => Boolean(route.params.id));

function resolveRequestedType() {
  return route.query.type === 'doc' ? 'doc' : 'template';
}

function clearFieldErrors() {
  fieldErrors.value = {};
}

function hideToast() {
  toastMessage.value = '';
  if (toastTimer) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
}

function showToast(message) {
  hideToast();
  toastMessage.value = message;
  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
    toastTimer = null;
  }, 4000);
}

function buildFieldErrors(validationKey) {
  switch (validationKey) {
    case 'app.validationNameRequired':
    case 'app.validationNameTooLong':
      return { name: t(validationKey) };
    case 'app.validationTagsTooMany':
    case 'app.validationTagTooLong':
      return { tags: t(validationKey) };
    case 'app.validationGitUrlRequired':
    case 'app.validationGitUrlInvalid':
      return { git_url: t(validationKey) };
    case 'app.validationBranchRequired':
      return { branch: t(validationKey) };
    case 'app.validationUriRequired':
    case 'app.validationUriInvalid':
      return { uri: t(validationKey) };
    case 'app.validationContentRequired':
      return { content: t(validationKey) };
    default:
      return {};
  }
}

async function loadResource() {
  if (!isEditMode.value) {
    resource.value = null;
    form.value = createEmptyForm(resolveRequestedType());
    tags.value = [];
    tagInput.value = '';
    loadErrorMessage.value = '';
    errorMessage.value = '';
    hideToast();
    clearFieldErrors();
    return;
  }

  loading.value = true;
  loadErrorMessage.value = '';
  errorMessage.value = '';
  hideToast();
  clearFieldErrors();

  try {
    resource.value = await resourcesAPI.getById(route.params.id);
    form.value = mapResourceToForm(resource.value);
    tags.value = parseResourceTags(resource.value.tags);
    tagInput.value = '';
  } catch (error) {
    loadErrorMessage.value = t('app.loadFailed', {
      error: getErrorMessage(error, t('app.apiError')),
    });
  } finally {
    loading.value = false;
  }
}

function addTag() {
  const tag = tagInput.value.trim().replace(/,$/, '');
  if (tag && !tags.value.includes(tag)) {
    tags.value.push(tag);
    tagInput.value = '';
    if (fieldErrors.value.tags) {
      fieldErrors.value = { ...fieldErrors.value, tags: '' };
    }
  }
}

function removeTag(index) {
  tags.value.splice(index, 1);
}

function goBack() {
  if (isEditMode.value) {
    router.push({ name: 'resource-detail', params: { id: route.params.id } });
    return;
  }

  router.push({ name: 'home' });
}

async function handleSubmit() {
  form.value.tagsInput = tags.value.join(',');
  clearFieldErrors();
  errorMessage.value = '';
  hideToast();

  const validation = validateForm(form.value);
  if (!validation.valid) {
    errorMessage.value = t(validation.message);
    fieldErrors.value = buildFieldErrors(validation.message);
    showToast(errorMessage.value);
    return;
  }

  errorMessage.value = '';
  successMessage.value = '';

  try {
    const payload = buildPayload(form.value);

    if (isEditMode.value && resource.value) {
      await resourcesAPI.update(resource.value.id, payload);
    } else if (form.value.type === 'template') {
      await resourcesAPI.createTemplate(payload);
    } else {
      await resourcesAPI.createDoc(payload);
    }

    successMessage.value = t('app.saveSuccess');
    router.push({ name: 'home', state: { resourceMessage: t('app.saveSuccess') } });
  } catch (error) {
    const friendlyError = getFriendlyResourceError(error, t);
    errorMessage.value = friendlyError.message;
    fieldErrors.value = {
      ...fieldErrors.value,
      ...friendlyError.fieldErrors,
    };
    showToast(errorMessage.value);
  }
}

onMounted(loadResource);

onBeforeUnmount(() => {
  hideToast();
});

watch(
  () => [route.params.id, route.query.type],
  () => {
    loadResource();
  }
);
</script>
