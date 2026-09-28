/* Timesheet Live — deploy config.
 * The endpoint comes from the shared switch in ../shared/nd-backend.js (one
 * URL for the whole suite). Until it's set, the page shows a "not connected
 * yet" notice instead of the passcode box. */
window.TSL_CONFIG = {
  endpoint: (window.ND_BACKEND && window.ND_BACKEND.endpoint) || '',
  pollMs: 45000          // live refresh while the tab is visible
};
