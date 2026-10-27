const ALL_URLS = '<all_urls>';

/** Optional broad host access (multi-page / pagination). Not required for single-tab capture via toolbar click. */
export async function ensureOptionalHostAccess() {
  const origins = [ALL_URLS];
  if (await chrome.permissions.contains({ origins })) return true;
  try {
    return await chrome.permissions.request({ origins });
  } catch {
    return false;
  }
}

export async function hasOptionalHostAccess() {
  return chrome.permissions.contains({ origins: [ALL_URLS] });
}
