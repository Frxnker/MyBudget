/**
 * validation.js
 * Validaciones reutilizables sin DOM: cantidades, fechas, imágenes y datos importados.
 * Devuelven { valor } o { error } con un mensaje pensado para mostrarse bajo el campo.
 */
const Validate = (() => {
  // Formatos de imagen admitidos para los recibos
  const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp)$/i;
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // tamaño máximo del archivo original (antes de comprimir)
  const MAX_AMOUNT = 99999999999;           // ~1.000 millones de euros, en céntimos

  /** Cantidad en euros escrita por el usuario. Devuelve { cents } o { error } */
  function amount(raw, { required = true, allowZero = false, label = 'La cantidad' } = {}) {
    if (raw === '' || raw === null || raw === undefined || String(raw).trim() === '') {
      return required ? { error: `${label} es obligatoria.` } : { cents: 0 };
    }
    const cents = Utils.toCents(raw);
    if (Number.isNaN(cents)) return { error: `${label} no es un número válido (ej. 12,50).` };
    if (allowZero ? cents < 0 : cents <= 0) {
      return { error: allowZero ? `${label} no puede ser negativa.` : `${label} debe ser mayor que 0.` };
    }
    if (cents > MAX_AMOUNT) return { error: `${label} es demasiado grande.` };
    return { cents };
  }

  /** Fecha ISO "AAAA-MM-DD" (la que devuelve <input type="date">) */
  function date(value, { required = true, label = 'La fecha' } = {}) {
    if (!value) return required ? { error: `${label} es obligatoria.` } : { value: '' };
    if (!Utils.isValidISODate(value)) return { error: `${label} no es válida.` };
    return { value };
  }

  /**
   * Archivo de imagen elegido para un recibo ({ name, type, size }, como un File).
   * Devuelve el mensaje de error o null si es válido.
   */
  function imageFile(file) {
    if (!file) return 'No se ha seleccionado ninguna imagen.';
    const typeOk = IMAGE_TYPES.includes(file.type) || (!file.type && IMAGE_EXTENSIONS.test(file.name || ''));
    if (!typeOk) return 'Formato no admitido. Usa una imagen JPG, PNG o WEBP.';
    if (!file.size) return 'La imagen está vacía.';
    if (file.size > MAX_IMAGE_BYTES) {
      return `La imagen ocupa ${Utils.formatBytes(file.size)}. El tamaño máximo es ${Utils.formatBytes(MAX_IMAGE_BYTES)}.`;
    }
    return null;
  }

  /** Imagen guardada como data URL (recibos importados): solo JPEG, PNG o WEBP en base64 */
  function isImageDataUrl(value) {
    return typeof value === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
  }

  const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

  return { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_AMOUNT, amount, date, imageFile, isImageDataUrl, isPlainObject };
})();
