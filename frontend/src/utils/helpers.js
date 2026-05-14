/** Pause execution for `ms` milliseconds. */
export const sleep = ms => new Promise(r => setTimeout(r, ms));
