/* ======================================================================
   STORAGE — File System Access API persistence
   Data lives in a user-chosen JSON file inside the project folder.
   The filename is never hardcoded — the user selects it each session.

   No handles are persisted between sessions. Every page load starts
   fresh so the app always operates on the folder currently in use,
   never on a previously stored path from another location.
   ====================================================================== */
'use strict';

const Storage = {
  _dirHandle:  null,   // FileSystemDirectoryHandle — set by connectFolder()
  _fileHandle: null,   // FileSystemFileHandle      — set by openFile()
  _filename:   null,   // active filename (e.g. "supplier1.json")
  _data:       null,   // in-memory working copy, reset on each openFile()

  /* ------------------------------------------------------------------ */
  /* Empty database template — used to initialise a new or invalid file  */
  /* ------------------------------------------------------------------ */
  _empty() {
    return {
      settings:  { id: 'app', dateMode: 'exact', logoDataUrl: null,
                   pdfAccentColor: '#4b5563', pdfBgColor: '#f3f4f6' },
      attendees: [],
      meetings:  [],
      draft:     null
    };
  },

  /* ------------------------------------------------------------------ */
  /* PUBLIC: called once on page load.                                   */
  /* Deletes the legacy IndexedDB handle store (from an old version) so  */
  /* stale cross-folder references can never reappear.                   */
  /* ------------------------------------------------------------------ */
  init() {
    try { indexedDB.deleteDatabase('MM_handles_v1'); } catch (_) {}
    this._data = this._empty();
  },

  /* ------------------------------------------------------------------ */
  /* PUBLIC (step 1): open a directory picker.                           */
  /* Only acquires the directory handle; does not open any file.         */
  /* ------------------------------------------------------------------ */
  async connectFolder() {
    this._dirHandle  = await window.showDirectoryPicker({ mode: 'readwrite' });
    this._fileHandle = null;
    this._filename   = null;
  },

  /* ------------------------------------------------------------------ */
  /* PUBLIC: list all .json files found in the connected folder.         */
  /* Returns a sorted array of filenames (strings).                      */
  /* ------------------------------------------------------------------ */
  async listJsonFiles() {
    if (!this._dirHandle) throw new Error('No folder connected.');
    const files = [];
    for await (const [name, handle] of this._dirHandle.entries()) {
      if (handle.kind === 'file' && name.toLowerCase().endsWith('.json')) {
        files.push(name);
      }
    }
    return files.sort((a, b) => a.localeCompare(b));
  },

  /* ------------------------------------------------------------------ */
  /* PUBLIC (step 2): bind to a specific JSON file.                      */
  /* Creates the file if it does not exist, resets in-memory state, then */
  /* loads and validates its contents.                                   */
  /* ------------------------------------------------------------------ */
  async openFile(filename) {
    if (!this._dirHandle) throw new Error('No folder connected.');
    if (!filename.toLowerCase().endsWith('.json')) filename += '.json';

    this._data       = this._empty();   // always start clean before loading
    this._filename   = filename;
    this._fileHandle = await this._dirHandle.getFileHandle(filename, { create: true });
    await this._loadFromFile();
  },

  /* Expose active filename for display in the UI */
  get activeFile() { return this._filename; },

  /* ------------------------------------------------------------------ */
  /* INTERNAL: read the open file into _data, with schema validation.    */
  /* ------------------------------------------------------------------ */
  async _loadFromFile() {
    const file = await this._fileHandle.getFile();
    const text = (await file.text()).trim();
    if (!text) return;   // brand-new empty file — keep defaults

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      console.warn(`[Storage] ${this._filename}: invalid JSON — starting with empty data.`);
      return;
    }

    // Accept the file only if it looks like an app database.
    // An unrelated JSON file (array, wrong shape, etc.) gets a fresh schema.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn(`[Storage] ${this._filename}: unexpected root type — starting fresh.`);
      return;
    }
    const looksValid = ('settings'  in parsed) ||
                       ('meetings'  in parsed) ||
                       ('attendees' in parsed) ||
                       ('draft'     in parsed);
    if (!looksValid) {
      console.warn(`[Storage] ${this._filename}: no recognised keys — starting fresh.`);
      return;
    }

    // Merge each section individually so missing keys fall back to defaults.
    if (parsed.settings && typeof parsed.settings === 'object') {
      this._data.settings = { ...this._empty().settings, ...parsed.settings };
    }
    if (Array.isArray(parsed.attendees)) this._data.attendees = parsed.attendees;
    if (Array.isArray(parsed.meetings))  this._data.meetings  = parsed.meetings;
    if ('draft' in parsed)               this._data.draft     = parsed.draft;
  },

  /* ------------------------------------------------------------------ */
  /* INTERNAL: write _data back to the open file.                        */
  /* ------------------------------------------------------------------ */
  async _save() {
    if (!this._fileHandle) throw new Error('No file open — call openFile() first.');
    const writable = await this._fileHandle.createWritable();
    await writable.write(JSON.stringify(this._data, null, 2));
    await writable.close();
  },

  /* ------------------------------------------------------------------ */
  /* DRAFT                                                               */
  /* ------------------------------------------------------------------ */
  async saveDraft(meeting) { this._data.draft = { ...meeting, id: 'current' }; await this._save(); },
  loadDraft()               { return Promise.resolve(this._data.draft || null); },
  async clearDraft()        { this._data.draft = null; await this._save(); },

  /* ------------------------------------------------------------------ */
  /* MEETINGS                                                            */
  /* ------------------------------------------------------------------ */
  async saveMeeting(meeting) {
    const i = this._data.meetings.findIndex(m => m.id === meeting.id);
    if (i >= 0) this._data.meetings[i] = meeting; else this._data.meetings.push(meeting);
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
  async saveSettings(s) { this._data.settings = { ...s, id: 'app' }; await this._save(); },
  loadSettings()        { return Promise.resolve(this._data.settings); },

  /* ------------------------------------------------------------------ */
  /* ATTENDEES                                                           */
  /* ------------------------------------------------------------------ */
  async saveAttendees(list) { this._data.attendees = list; await this._save(); },
  loadAttendees()           { return Promise.resolve(Array.isArray(this._data.attendees) ? this._data.attendees : []); }
};
