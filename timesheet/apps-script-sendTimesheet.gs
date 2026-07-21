/**
 * REMOVED (Timesheet v2 rework, §5).
 *
 * The auto-emailer is gone. The timesheet no longer sends email through the
 * backend — export is now "Copy timesheet" + "Open in mail app" on the client.
 *
 * ACTION FOR BRANDON:
 *   1. Delete this file from the repo (the sandbox can't delete it for you).
 *   2. In the deployed Apps Script (the Quote /exec project), remove the
 *      `sendTimesheet` branch from doPost and the handleSendTimesheet_ helper.
 *      The Quote actions (login / get_quotes / change_status) stay as-is.
 *
 * No client code references `action:'sendTimesheet'` anymore.
 */
