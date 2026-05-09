'use strict';

const crypto = require('crypto');

// In-memory store: array of feed entries, newest first. Resets on server restart.
// Max MAX_EVENTS entries total across all projects (D-07).
const MAX_EVENTS = 200;
const events = [];

/**
 * Push a landmark event to the in-memory feed store.
 * @param {{ type: string, projectName: string, projectDisplayName: string, label: string, detectedAt: string }} entry
 */
function pushEvent(entry) {
  events.unshift({ ...entry, id: crypto.randomUUID() });
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
}

function getEvents() {
  return [...events];
}

function _resetEvents() {
  events.length = 0;
}

module.exports = { pushEvent, getEvents, _resetEvents };
