const DEFAULTS = {
  toolbarCaptureMode: 'image',
  openViewerAfterCapture: true,
  overlapPx: 80,
  fullScanPageLimit: 25,
  followPagination: true,
  historyLimit: 40,
  showProgressOverlay: false,
};

export async function getSettings() {
  const data = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...data };
}

export async function setSettings(patch) {
  await chrome.storage.sync.set(patch);
  return getSettings();
}
