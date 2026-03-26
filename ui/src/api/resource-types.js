export function getResourceTypeOptions(t) {
  return [
    { value: 'all', label: t('app.filterAll') },
    { value: 'template', label: t('app.templateType') },
    { value: 'doc', label: t('app.docType') },
  ];
}

export function getResourceTypeLabel(type, t) {
  if (type === 'template') {
    return t('app.templateType');
  }

  if (type === 'doc') {
    return t('app.docType');
  }

  return t('resource.unknown');
}
