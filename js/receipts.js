/**
 * receipts.js
 * Imágenes de recibos asociadas a los movimientos.
 *
 * Las imágenes NO se guardan junto a los movimientos: ocupan mucho más que el resto de datos y
 * LocalStorage tiene un límite de unos 5 MB. Se guardan aparte, en IndexedDB (también local y con
 * mucho más espacio), y el movimiento solo guarda el id del recibo (receiptId).
 * Si el navegador no permite usar IndexedDB (algunos lo bloquean en modo privado o con file://),
 * se usa LocalStorage, con una clave por recibo.
 *
 * Nunca se suben a ningún servidor. Antes de guardarlas se reducen (1600 px como máximo) y se
 * comprimen en WEBP (o JPEG si el navegador no sabe generar WEBP).
 *
 * Registro guardado: { id, dataUrl, width, height, createdAt }
 */
const Receipts = (() => {
  const { $, formatDate, formatMoney, formatBytes } = Utils;

  const DB_NAME = 'mybudget';
  const STORE_NAME = 'receipts';
  const LS_PREFIX = 'gestorGastos.receipt.';
  const MAX_SIDE = 1600;                         // lado mayor de la imagen guardada (px)
  const MAX_DATA_LENGTH = 700 * 1024;            // tamaño máximo tras comprimir (~520 KB)
  const MAX_DATA_URL_LENGTH = 4 * 1024 * 1024;   // máximo al importar recibos de una copia

  /* ---------------------------------------------------------------
   * ALMACENES
   * ------------------------------------------------------------- */

  const local = {
    name: 'local',
    async get(id) {
      const raw = localStorage.getItem(LS_PREFIX + id);
      return raw ? JSON.parse(raw) : null;
    },
    async put(record) {
      localStorage.setItem(LS_PREFIX + record.id, JSON.stringify(record));
    },
    async remove(id) {
      localStorage.removeItem(LS_PREFIX + id);
    },
    async keys() {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LS_PREFIX)) keys.push(key.slice(LS_PREFIX.length));
      }
      return keys;
    },
    async all() {
      const keys = await this.keys();
      return (await Promise.all(keys.map((id) => this.get(id)))).filter(Boolean);
    },
    async clear() {
      (await this.keys()).forEach((id) => localStorage.removeItem(LS_PREFIX + id));
    },
    async replaceAll(records) {
      await this.clear();
      records.forEach((record) => localStorage.setItem(LS_PREFIX + record.id, JSON.stringify(record)));
    },
  };

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB no está disponible'));
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('IndexedDB está bloqueado'));
    });
  }

  /** Almacén de IndexedDB. Cada operación termina cuando se completa su transacción */
  function indexedStore(db) {
    const run = (mode, operation) => new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve(request ? request.result : undefined);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Operación cancelada'));
    });
    return {
      name: 'indexeddb',
      get: (id) => run('readonly', (s) => s.get(id)).then((r) => r || null),
      put: (record) => run('readwrite', (s) => s.put(record)),
      remove: (id) => run('readwrite', (s) => s.delete(id)),
      keys: () => run('readonly', (s) => s.getAllKeys()),
      all: () => run('readonly', (s) => s.getAll()),
      clear: () => run('readwrite', (s) => s.clear()),
      // Todo en una transacción: o se guardan todos los recibos o ninguno
      replaceAll: (records) => run('readwrite', (s) => {
        s.clear();
        records.forEach((record) => s.put(record));
      }),
    };
  }

  // [principal, LocalStorage]: también se mira LocalStorage por si se guardaron recibos sin IndexedDB
  let storesPromise = null;
  function stores() {
    if (!storesPromise) {
      storesPromise = openDatabase()
        .then((db) => [indexedStore(db), local])
        .catch((error) => {
          console.warn('Los recibos se guardarán en LocalStorage:', error);
          return [local];
        });
    }
    return storesPromise;
  }

  /** Para los tests: fuerza un almacén ("local") */
  function useStore(name) {
    storesPromise = name === 'local' ? Promise.resolve([local]) : null;
  }

  /* ---------------------------------------------------------------
   * API
   * ------------------------------------------------------------- */

  let statsCache = null;

  async function save(record) {
    const [primary] = await stores();
    statsCache = null;
    await primary.put(record);
  }

  async function get(id) {
    for (const store of await stores()) {
      const record = await store.get(id);
      if (record) return record;
    }
    return null;
  }

  async function remove(id) {
    statsCache = null;
    await Promise.all((await stores()).map((store) => store.remove(id)));
  }

  async function clear() {
    statsCache = null;
    await Promise.all((await stores()).map((store) => store.clear()));
  }

  async function all() {
    const lists = await Promise.all((await stores()).map((store) => store.all()));
    return lists.flat();
  }

  /** Borra las imágenes que ya no usa ningún movimiento. Devuelve cuántas se han borrado */
  async function prune(usedIds) {
    let removed = 0;
    for (const store of await stores()) {
      const orphans = (await store.keys()).filter((id) => !usedIds.has(id));
      await Promise.all(orphans.map((id) => store.remove(id)));
      removed += orphans.length;
    }
    if (removed) statsCache = null;
    return removed;
  }

  /** Sustituye todos los recibos (al importar una copia de seguridad) */
  async function replaceAll(records) {
    const list = await stores();
    statsCache = null;
    await Promise.all(list.slice(1).map((store) => store.clear()));
    await list[0].replaceAll(records);
  }

  /** Recibos para la copia de seguridad */
  async function exportAll() {
    return (await all()).map((r) => ({ id: r.id, dataUrl: r.dataUrl, createdAt: r.createdAt }));
  }

  /** Bytes que ocupa la imagen de un data URL (base64 → 3 bytes por cada 4 caracteres) */
  function byteSize(dataUrl) {
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    return Math.round((base64.length * 3) / 4);
  }

  /** Número de recibos y espacio que ocupan */
  async function stats() {
    if (!statsCache) {
      const records = await all();
      const [primary] = await stores();
      statsCache = { count: records.length, bytes: records.reduce((sum, r) => sum + byteSize(r.dataUrl), 0), store: primary.name };
    }
    return statsCache;
  }

  /* ---------------------------------------------------------------
   * COMPRESIÓN
   * ------------------------------------------------------------- */

  async function loadImage(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch { /* se intenta con <img> */ }
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('invalid')); };
      img.src = url;
    });
  }

  /**
   * Valida, reduce y comprime una imagen. Devuelve { dataUrl, width, height }.
   * Si sigue ocupando demasiado, baja la calidad y después el tamaño hasta que quepa.
   */
  async function compress(file) {
    const error = Validate.imageFile(file);
    if (error) throw new Error(error);

    let image;
    try {
      image = await loadImage(file);
    } catch {
      throw new Error('El archivo no es una imagen válida o está dañado.');
    }
    const { width, height } = image;
    if (!width || !height) throw new Error('La imagen no tiene un tamaño válido.');

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    let quality = 0.82;
    let dataUrl = '';
    for (let attempt = 0; attempt < 8; attempt++) {
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      // Fondo blanco: las zonas transparentes de un PNG no se vuelven negras al pasar a JPEG
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      dataUrl = canvas.toDataURL('image/webp', quality);
      if (!dataUrl.startsWith('data:image/webp')) dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= MAX_DATA_LENGTH) break;
      if (quality > 0.55) quality -= 0.12;
      else { scale *= 0.75; quality = 0.75; }
    }
    if (typeof image.close === 'function') image.close();
    if (dataUrl.length > MAX_DATA_LENGTH) throw new Error('No se ha podido reducir la imagen lo suficiente. Prueba con otra foto.');
    return { dataUrl, width: canvas.width, height: canvas.height };
  }

  /* ---------------------------------------------------------------
   * VISOR
   * ------------------------------------------------------------- */

  let viewingTx = null;

  /** Abre el visor con una imagen. Con "txId" se puede eliminar el recibo de ese movimiento */
  function openViewer({ src, title, subtitle = '', txId = null }) {
    viewingTx = txId;
    $('#receipt-title').textContent = title;
    $('#receipt-subtitle').textContent = subtitle;
    const img = $('#receipt-image');
    img.src = src;
    img.alt = `Recibo: ${title}`;
    const extension = src.startsWith('data:image/png') ? 'png' : src.startsWith('data:image/webp') ? 'webp' : 'jpg';
    const download = $('#receipt-download');
    download.href = src;
    download.download = `recibo-${Utils.normalize(title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mybudget'}.${extension}`;
    $('#receipt-delete').hidden = !txId;
    UI.openModal('receipt-modal');
  }

  /** "Ver recibo" desde el historial */
  async function view(txId) {
    const tx = Transactions.get(txId);
    if (!tx || !tx.receiptId) return;
    let record = null;
    try {
      record = await get(tx.receiptId);
    } catch (error) {
      console.error(error);
    }
    if (!record) {
      UI.toast('El recibo no está disponible en este navegador (puede que se borraran los datos del sitio).', 'warning', 5000);
      return;
    }
    openViewer({
      src: record.dataUrl,
      title: tx.concept,
      subtitle: `${formatDate(tx.date)} · ${formatMoney(tx.amount)} · ${formatBytes(byteSize(record.dataUrl))}`,
      txId,
    });
  }

  async function deleteViewed() {
    const tx = Transactions.get(viewingTx);
    if (!tx || !tx.receiptId) return;
    const ok = await UI.confirm({
      title: 'Eliminar recibo',
      message: `Se eliminará la imagen del recibo de "${tx.concept}". El movimiento no se modifica.`,
    });
    if (!ok) return;
    const { receiptId } = tx;
    Transactions.update(tx.id, { receiptId: undefined });
    UI.closeModal('receipt-modal');
    try {
      await remove(receiptId);
    } catch (error) {
      console.error(error);
    }
    UI.toast('Recibo eliminado', 'info');
  }

  function init() {
    $('#receipt-delete').addEventListener('click', deleteViewed);
  }

  return {
    MAX_DATA_URL_LENGTH, save, get, remove, clear, prune, replaceAll, exportAll, stats, byteSize,
    compress, openViewer, view, init, useStore,
  };
})();
