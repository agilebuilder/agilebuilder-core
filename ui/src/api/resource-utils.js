export function normalizeTag(tag) {
  return String(tag || '').trim().replace(/^["']|["']$/g, '');
}

export function parseResourceTags(tags) {
  if (!tags) {
    return [];
  }

  if (Array.isArray(tags)) {
    return tags.map(normalizeTag).filter(Boolean);
  }

  const value = String(tags).trim();
  if (!value) {
    return [];
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeTag).filter(Boolean);
      }
    } catch {
      return value
        .slice(1, -1)
        .split(',')
        .map(normalizeTag)
        .filter(Boolean);
    }
  }

  return value
    .split(',')
    .map(normalizeTag)
    .filter(Boolean);
}

export function stringifyTagList(tags) {
  return parseResourceTags(tags).join(', ');
}

export function formatResourceDate(value, options = {}) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, options).format(date);
}

export function formatShortResourceDate(value) {
  return formatResourceDate(value, {
    month: 'short',
    day: 'numeric',
  });
}

export function formatFullResourceDate(value) {
  return formatResourceDate(value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getErrorMessage(error, fallback) {
  return error?.response?.data?.error?.message || error?.message || fallback;
}

export function isDuplicateResourceNameError(error) {
  const message = String(error?.response?.data?.error?.message || error?.message || '').toLowerCase();

  return message.includes('unique constraint failed: resources.name')
    || (message.includes('resources.name') && message.includes('unique'))
    || message.includes('duplicate resource name');
}

export function getFriendlyResourceError(error, t) {
  if (isDuplicateResourceNameError(error)) {
    return {
      message: t('app.validationNameDuplicate'),
      fieldErrors: {
        name: t('app.validationNameDuplicate'),
      },
    };
  }

  return {
    message: t('app.saveFailed', {
      error: getErrorMessage(error, t('app.apiError')),
    }),
    fieldErrors: {},
  };
}
