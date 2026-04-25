export const VALID_FEATURE_STATUSES = new Set([
  "IDEA",
  "PLANNED",
  "IN_PROGRESS",
  "VERIFYING",
  "SHIPPED",
  "ARCHIVED",
]);

export function normalizeFeatureStatus(value) {
  return value?.replace(/`/g, "").trim() ?? "";
}

export function isValidFeatureStatus(value) {
  return VALID_FEATURE_STATUSES.has(normalizeFeatureStatus(value));
}

export function validFeatureStatusList() {
  return [...VALID_FEATURE_STATUSES].join(", ");
}
