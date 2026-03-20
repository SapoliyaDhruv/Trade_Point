import { environment } from '../../../environments/environment';

export const apiUrl = (path: string): string => {
  const base = environment.apiBaseUrl.replace(/\/+$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
};

export const assetUrl = (value: string | null | undefined): string => {
  if (!value) return '';
  const trimmed = String(value);
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const base = environment.assetBaseUrl.replace(/\/+$/, '');
  const normalized = trimmed.replace(/^\/+/, '');
  if (!base) {
    return `/${normalized}`;
  }
  return `${base}/${normalized}`;
};
