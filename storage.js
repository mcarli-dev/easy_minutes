/* ======================================================================
   STORAGE — File System Access API persistence
   All data lives in db.json, physically inside the project folder.
   Portable: copy/zip/move the folder and all data travels with it.

   NO directory handles are persisted between sessions.
   Every page load requires a fresh folder selection so the app always
   operates on the folder that contains the currently-open index.html,
   never on a previously stored path from another location.
   ====================================================================== */
'use strict';

const Storage = {
  /* In-memory working copy of the database */
  _data: {
    settings:  { id: 'app', dateMode: 'exact', logoDataUrl: null, pdfAccentColor: '#4b5563', pdfBgColor: '#f3f4f6' },
    attendees: [],
    meetings:  [],
    draft:     null
  },

  _dirHandle:  null,   // FileSystemDirectoryHandle — set only after connectFolder()
  _fileHandle: null,   // FileSystemFileHandle     — db.json, set only after connectFolder()

  /* ------------------------------------------------------------------ */
  /* PUBLIC: called once on page load.                                   */
  /* Cleans up any previously stored handles (from the old caching       */
  /* implementation) and signals that folder selection is always needed. */
  /* ------------------------------------------------------------------ */
  init() {
    // Proactively delete the legacy IndexedDB handle store so that old
    // cached paths from a previous installation never interfere.
    try { indexedDB.deleteDatabase('MM_handles_v1'); } catch (_) {}
    // No auto-connect: the user must always select the current folder.
  },

  /* ------------------------------------------------------------------ */
  /* PUBLIC: called after a user gesture (button click).                 */
  /* Opens a directory picker — user must select the folder containing   */
  /* index.html. Then reads db.json from that folder (creates if absent).*/
  /* ------------------------------------------------------------------ */
  async connectFolder() {
    this._dirHandle  = await window.showDirectoryPicker({ mode: 'readwrite' });
    this._fileHandle = await this._dirHandle.getFileHandle('db.json', { create: true });
    await this._loadFromFile();
  },

  /* ------------------------------------------------------------------ */
  /* INTERNAL: read db.json into _data                                   */
  /* ------------------------------------------------------------------ */
  async _loadFromFile() {
    const file = await this._fileHandle.getFile();
    const text = (await file.text()).trim();
    if (!text) return;
    try {
      const p = JSON.parse(text);
      if (p.settings)   this._data.settings  = p.settings;
      if (p.attendees)  this._data.attendees = p.attendees;
      if (p.meetings)   this._data.meetings  = p.meetings;
      if ('draft' in p) this._data.draft     = p.draft;
    } catch (e) {
      console.warn('db.json parse error — starting with empty data:', e);
    }
  },

  /* ------------------------------------------------------------------ */
  /* INTERNAL: write _data back to db.json                               */
  /* ------------------------------------------------------------------ */
  async _save() {
    if (!this._fileHandle) throw new Error('No folder connected — call connectFolder() first.');
    const writable = await this._fileHandle.createWritable();
    await writable.write(JSON.stringify(this._data, null, 2));
    await writable.close();
  },

  /* ------------------------------------------------------------------ */
  /* DRAFT (auto-saved while editing)                                    */
  /* ------------------------------------------------------------------ */
  async saveDraft(meeting) {
    this._data.draft = { ...meeting, id: 'current' };
    await this._save();
  },

  loadDraft() { return Promise.resolve(this._data.draft || null); },

  async clearDraft() {
    this._data.draft = null;
    await this._save();
  },

  /* ------------------------------------------------------------------ */
  /* MEETINGS (finalized history)                                        */
  /* ------------------------------------------------------------------ */
  async saveMeeting(meeting) {
    const i = this._data.meetings.findIndex(m => m.id === meeting.id);
    if (i >= 0) this._data.meetings[i] = meeting;
    else        this._data.meetings.push(meeting);
    await this._save();
  },

  getMeeting(id) {
    return Promise.resolve(this._data.meetings.find(m => m.id === id) || null);
  },

  getAllMeetings() {
    const list = [...this._data.meetings].sort((a, b) => (b.finalizedAt || 0) - (a.finalizedAt || 0));
    return Promise.resolve(list);
  },

  async deleteMeeting(id) {
    this._data.meetings = this._data.meetings.filter(m => m.id !== id);
    await this._save();
  },

  /* ------------------------------------------------------------------ */
  /* SETTINGS                                                            */
  /* ------------------------------------------------------------------ */
  async saveSettings(settings) {
    this._data.settings = { ...settings, id: 'app' };
    await this._save();
  },

  loadSettings() {
    return Promise.resolve(
      this._data.settings ||
      { id: 'app', dateMode: 'exact', logoDataUrl: null, pdfAccentColor: '#4b5563', pdfBgColor: '#f3f4f6' }
    );
  },

  /* ------------------------------------------------------------------ */
  /* ATTENDEES MASTER LIST                                               */
  /* ------------------------------------------------------------------ */
  async saveAttendees(list) {
    this._data.attendees = list;
    await this._save();
  },

  loadAttendees() {
    return Promise.resolve(Array.isArray(this._data.attendees) ? this._data.attendees : []);
  }
};
