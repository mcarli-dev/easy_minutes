/* ======================================================================
   STORAGE — All IndexedDB persistence logic
   Manages: Settings, Attendees master list, Logo (via settings),
            Draft, History entries
   No storage logic should live in UI components.
   ====================================================================== */
'use strict';

const Storage = {
  db: null,
  DB_NAME: (() => {
    try {
      const path = window.location.pathname;
      const dir = path.substring(0, path.lastIndexOf('/') + 1);
      let h = 0;
      for (let i = 0; i < dir.length; i++) {
        h = Math.imul(31, h) + dir.charCodeAt(i) | 0;
      }
      return 'MM_' + Math.abs(h).toString(36);
    } catch(e) {
      return 'MeetingMinutesDB';
    }
  })(),
  DB_VERSION: 2,

  _req(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror  = () => reject(request.error);
    });
  },

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      req.onupgradeneeded = e => {
        const db = e.target.result;
        // v1 stores (kept for backward compatibility)
        if (!db.objectStoreNames.contains('meetings')) {
          const s = db.createObjectStore('meetings', { keyPath: 'id' });
          s.createIndex('finalizedAt', 'finalizedAt', { unique: false });
          s.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains('draft')) {
          db.createObjectStore('draft', { keyPath: 'id' });
        }
        // v2 stores (new)
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('attendees')) {
          db.createObjectStore('attendees', { keyPath: 'id' });
        }
      };

      req.onsuccess = () => { this.db = req.result; resolve(); };
      req.onerror   = () => reject(req.error);
    });
  },

  // ---- Draft (auto-saved while editing) ----

  saveDraft(meeting) {
    const tx = this.db.transaction('draft', 'readwrite');
    return this._req(tx.objectStore('draft').put({ ...meeting, id: 'current' }));
  },

  loadDraft() {
    const tx = this.db.transaction('draft', 'readonly');
    return this._req(tx.objectStore('draft').get('current'));
  },

  clearDraft() {
    const tx = this.db.transaction('draft', 'readwrite');
    return this._req(tx.objectStore('draft').delete('current'));
  },

  // ---- History (finalized meetings only) ----

  saveMeeting(meeting) {
    const tx = this.db.transaction('meetings', 'readwrite');
    return this._req(tx.objectStore('meetings').put(meeting));
  },

  getMeeting(id) {
    const tx = this.db.transaction('meetings', 'readonly');
    return this._req(tx.objectStore('meetings').get(id));
  },

  getAllMeetings() {
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction('meetings', 'readonly');
      const req = tx.objectStore('meetings').getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => (b.finalizedAt || 0) - (a.finalizedAt || 0));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  },

  deleteMeeting(id) {
    const tx = this.db.transaction('meetings', 'readwrite');
    return this._req(tx.objectStore('meetings').delete(id));
  },

  // ---- Settings (dateMode, logoDataUrl) ----

  async saveSettings(settings) {
    const tx = this.db.transaction('settings', 'readwrite');
    return this._req(tx.objectStore('settings').put({ ...settings, id: 'app' }));
  },

  async loadSettings() {
    const tx = this.db.transaction('settings', 'readonly');
    const result = await this._req(tx.objectStore('settings').get('app'));
    return result || { id: 'app', dateMode: 'exact', logoDataUrl: null, pdfAccentColor: '#4b5563', pdfBgColor: '#f3f4f6' };
  },

  // ---- Attendees Master List ----

  async saveAttendees(list) {
    const tx = this.db.transaction('attendees', 'readwrite');
    return this._req(tx.objectStore('attendees').put({ id: 'master', list }));
  },

  async loadAttendees() {
    const tx = this.db.transaction('attendees', 'readonly');
    const result = await this._req(tx.objectStore('attendees').get('master'));
    return (result && Array.isArray(result.list)) ? result.list : [];
  }
};
