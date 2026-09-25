// İstemci durumu: oturum kullanıcısı + referans verileri önbelleği.
import { api } from './api.js';

const state = {
  user: null,
  roomTypes: [],
  staff: [],
  channels: [],
  loaded: false,
};

export const store = {
  get user() { return state.user; },
  set user(u) { state.user = u; },
  get roomTypes() { return state.roomTypes; },
  get staff() { return state.staff; },
  get channels() { return state.channels; },

  can(moduleId) { return state.user && state.user.modules && state.user.modules.includes(moduleId); },

  async load(force = false) {
    if (state.loaded && !force) return state;
    const [roomTypes, staff, channels] = await Promise.all([
      api.roomTypes(), api.staff(), api.channels(),
    ]);
    state.roomTypes = roomTypes;
    state.staff = staff;
    state.channels = channels;
    state.loaded = true;
    return state;
  },

  async refreshChannels() {
    state.channels = await api.channels();
    return state.channels;
  },

  roomType(id) { return state.roomTypes.find((r) => r.id === id) || null; },
  roomTypeName(id) { const r = this.roomType(id); return r ? r.name : '—'; },
  channel(id) { return state.channels.find((c) => c.id === id) || null; },
  housekeepers() { return state.staff.filter((s) => s.role === 'housekeeping' && s.active); },
};
