import { parseResourceTags, stringifyTagList } from './resource-utils.js';

export function parseTagInput(value) {
  return parseResourceTags(value);
}

export function stringifyTags(value) {
  return stringifyTagList(value);
}

export function createEmptyForm(type = 'template') {
  return {
    type,
    name: '',
    description: '',
    tagsInput: '',
    git_url: '',
    branch: 'main',
    uri: '',
    content: '',
  };
}

export function mapResourceToForm(resource) {
  const form = createEmptyForm(resource.type);

  form.name = resource.name || '';
  form.description = resource.description || '';
  form.tagsInput = stringifyTags(resource.tags);

  if (resource.type === 'template') {
    form.git_url = resource.git_url || '';
    form.branch = resource.branch || 'main';
  } else {
    form.uri = resource.uri || '';
    form.content = resource.content || '';
  }

  return form;
}

export function buildPayload(form) {
  const tags = parseTagInput(form.tagsInput);
  const basePayload = {
    name: form.name.trim(),
    description: form.description.trim(),
    tags,
  };

  if (form.type === 'template') {
    return {
      ...basePayload,
      git_url: form.git_url.trim(),
      branch: form.branch.trim() || 'main',
    };
  }

  return {
    ...basePayload,
    uri: form.uri.trim(),
    content: form.content.trim(),
  };
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidGitUrl(value) {
  if (!value) {
    return false;
  }

  if (isValidHttpUrl(value)) {
    return /\.git$/i.test(value) || value.includes('github.com') || value.includes('gitlab.com') || value.includes('gitee.com');
  }

  return /^(git@|ssh:\/\/)/i.test(value);
}

function isLikelyValidUri(value) {
  if (!value) {
    return false;
  }

  if (isValidHttpUrl(value)) {
    return true;
  }

  return /^[a-zA-Z][a-zA-Z\d+.-]*:\/\/.+/.test(value) || /^\/?[\w./-]+$/.test(value);
}

export function validateForm(form) {
  const name = form.name.trim();
  const tags = parseTagInput(form.tagsInput);

  if (!name) {
    return { valid: false, message: 'app.validationNameRequired' };
  }

  if (name.length > 100) {
    return { valid: false, message: 'app.validationNameTooLong' };
  }

  if (tags.length > 8) {
    return { valid: false, message: 'app.validationTagsTooMany' };
  }

  if (tags.some((tag) => tag.length > 20)) {
    return { valid: false, message: 'app.validationTagTooLong' };
  }

  if (form.type === 'template') {
    if (!form.git_url.trim()) {
      return { valid: false, message: 'app.validationGitUrlRequired' };
    }

    if (!isValidGitUrl(form.git_url.trim())) {
      return { valid: false, message: 'app.validationGitUrlInvalid' };
    }

    if (!form.branch.trim()) {
      return { valid: false, message: 'app.validationBranchRequired' };
    }

    return { valid: true };
  }

  if (!form.uri.trim()) {
    return { valid: false, message: 'app.validationUriRequired' };
  }

  if (!isLikelyValidUri(form.uri.trim())) {
    return { valid: false, message: 'app.validationUriInvalid' };
  }

  if (!form.content.trim()) {
    return { valid: false, message: 'app.validationContentRequired' };
  }

  return { valid: true };
}
