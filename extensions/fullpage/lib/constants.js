export const DB_NAME = 'fullpage-capture';
export const DB_VERSION = 2;
export const STORE_CAPTURES = 'captures';
export const STORE_MULTIPAGE = 'multipage_projects';

export const MULTIPAGE_SESSION_KEY = 'multipageActiveSessionId';

export const CAPTURE_TYPES = {
  IMAGE: 'image',
  RECONSTRUCT: 'reconstruct',
  FULLSCAN: 'fullscan',
  MULTIPAGE: 'multipage',
  REGION: 'region',
};

export const NFP_FORMAT_VERSION = 1;

export const DEFAULT_SCAN_LIMIT = 25;
export const SCROLL_SETTLE_MS = 120;
/** Chrome limits captureVisibleTab (~2/sec); stay under quota. */
export const CAPTURE_VISIBLE_TAB_MIN_INTERVAL_MS = 550;
export const LAZY_LOAD_EXTRA_MS = 200;
export const STITCH_OVERLAP_PX = 2;
