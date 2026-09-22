export function createPlayerSaveStatus(store) {
  let cloud = 'local';
  const doc = globalThis.document;
  const badge = doc?.createElement?.('div');
  if (badge) {
    badge.id = 'player-save-status';
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-live', 'polite');
    doc.body.append(badge);
  }
  const render = () => {
    if (!badge) return;
    const local = store.getStatus().localStatus;
    const message = local === 'error' ? 'Progress is only in memory — browser storage is unavailable. Keep this tab open.'
      : local === 'saving' ? 'Saving on this device…'
      : cloud === 'synced' ? 'Saved on this device and in your profile'
      : cloud === 'syncing' ? 'Saved on this device · Syncing profile…'
      : cloud === 'pending' ? 'Saved on this device · Cloud sync pending'
      : 'Saved on this device · Sign in for cloud backup';
    if (badge.textContent !== message) badge.textContent = message;
    badge.dataset.state = local === 'error' ? 'error' : cloud;
  };
  store.subscribe(render);
  render();
  return status => { cloud = status; render(); };
}
