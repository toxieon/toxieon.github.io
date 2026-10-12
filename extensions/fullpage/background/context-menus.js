const MENU = {
  reconstruct: 'fullpage-reconstruct',
  fullscan: 'fullpage-fullscan',
  options: 'fullpage-options',
  history: 'fullpage-history',
  popup: 'fullpage-popup',
};

export function registerContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU.reconstruct,
      title: 'Reconstruct (searchable HTML)',
      contexts: ['action'],
    });
    chrome.contextMenus.create({
      id: MENU.fullscan,
      title: 'Full scan (multi-page)',
      contexts: ['action'],
    });
    chrome.contextMenus.create({ id: 'sep1', type: 'separator', contexts: ['action'] });
    chrome.contextMenus.create({
      id: MENU.popup,
      title: 'More capture options…',
      contexts: ['action'],
    });
    chrome.contextMenus.create({
      id: MENU.history,
      title: 'Open capture history',
      contexts: ['action'],
    });
    chrome.contextMenus.create({
      id: MENU.options,
      title: 'Settings',
      contexts: ['action'],
    });
  });
}

export function menuIdToKind(id) {
  if (id === MENU.reconstruct) return 'reconstruct';
  if (id === MENU.fullscan) return 'fullscan';
  return null;
}

export { MENU };
