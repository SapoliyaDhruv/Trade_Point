const PlatformSetting = require('../models/PlatformSetting');

const DEFAULT_KEY = 'default';

const normalizeKeywords = (keywords = []) => {
  if (!Array.isArray(keywords)) {
    return [];
  }

  const unique = new Set();
  for (const raw of keywords) {
    const term = String(raw || '').trim().toLowerCase();
    if (term.length >= 2) {
      unique.add(term);
    }
  }
  return [...unique];
};

const getPlatformSettings = async () => {
  let settings = await PlatformSetting.findOne({ key: DEFAULT_KEY });
  if (settings) {
    return settings;
  }

  try {
    settings = await PlatformSetting.create({ key: DEFAULT_KEY });
    return settings;
  } catch (err) {
    if (err?.code === 11000) {
      return PlatformSetting.findOne({ key: DEFAULT_KEY });
    }
    throw err;
  }
};

const extractModerationFlags = ({ name = '', description = '', location = '' }, keywords = []) => {
  const haystack = [name, description, location]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!haystack) {
    return [];
  }

  const normalized = normalizeKeywords(keywords);
  return normalized.filter((term) => haystack.includes(term));
};

module.exports = {
  getPlatformSettings,
  normalizeKeywords,
  extractModerationFlags
};
