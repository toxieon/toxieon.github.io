/* Timesheet Live — deploy config.
 * endpoint: the /exec URL of the "Timesheet Live" Apps Script web app
 * (source + deploy steps: timesheetlive/apps-script/Code.gs). Until it's set,
 * the page shows a "not connected yet" notice instead of the passcode box. */
window.TSL_CONFIG = {
  endpoint: '',
  pollMs: 45000          // live refresh while the tab is visible
};
