// Punto de entrada JavaScript para Guimerans Lab. Modulo funcional de Preparados Pendientes.

// Definicion de estados permitidos y orden de avance
const STATUS_FLOW = ['Pendiente', 'Listo', 'Entregado'];

// Estado temporal en memoria (se reemplazara por base de datos real luego)
const state = {
  items: [],       // Preparados pendientes
  editingId: null,
  stockItems: [],  // Inventario de materias primas
  formulas: []     // Biblioteca de formulas
};

// Referencias a elementos de la interfaz
const form = document.getElementById('prepForm');
const listContainer = document.getElementById('prepList');
const searchInput = document.getElementById('searchInput');
const stockForm = document.getElementById('stockForm');
const stockList = document.getElementById('stockList');
const stockSearch = document.getElementById('stockSearch');
const dashboardLowStockList = document.getElementById('dashboardLowStockList');
const dashboardExpiringList = document.getElementById('dashboardExpiringList');
const dashboardLowStockCount = document.getElementById('dashboardLowStockCount');
const dashboardExpiringCount = document.getElementById('dashboardExpiringCount');
const formulaForm = document.getElementById('formulaForm');
const ingredientsContainer = document.getElementById('ingredientsContainer');
const addIngredientBtn = document.getElementById('addIngredientBtn');
const formulaList = document.getElementById('formulaList');
const formulaSearch = document.getElementById('formulaSearch');
const formulaResetBtn = document.getElementById('formulaResetBtn');
const formulaSubmitBtn = document.getElementById('formulaSubmitBtn');
const formulaCostLabel = document.getElementById('formulaCostLabel');
const importBtn = document.getElementById('importBtn');
const importInput = document.getElementById('importInput');
const importSummary = document.getElementById('importSummary');
const stockEditModal = document.getElementById('stockEditModal');
const stockEditForm = document.getElementById('stockEditForm');
const stockEditCloseBtn = stockEditModal?.querySelector('.modal-close');
const stockEditCancelBtn = stockEditModal?.querySelector('.modal-cancel');
const formulaInput = form?.querySelector('input[name="formula"]');
const cantidadInput = form?.querySelector('input[name="cantidad"]');
const unidadMedidaInput = form?.querySelector('select[name="unidadMedida"]');
const costoInput = form?.querySelector('input[name="costo"]');
const recargoInput = form?.querySelector('input[name="recargo"]');
const precioFinalInput = form?.querySelector('input[name="precioFinal"]');

let editingFormulaId = null;
let selectedPrepFormulaBase = null;
const STOCK_IMPACT_STATUSES = new Set(['Listo', 'Entregado']);
const MOVIMIENTO_STOCK_CONSUMO = 'consumo_preparado';
const MOVIMIENTO_STOCK_REVERSION = 'reversion_preparado';
const PREPARADOS_RECETAS_BUCKET = 'recetas-preparados';

// ---- Helpers de datos ----

/** Genera un identificador simple basado en timestamp */
const genId = () => `prep-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

/** Formatea cantidad + unidad para mostrar siempre el mismo estilo */
function formatCantidad(item) {
  const cantidad = Number(item.cantidad) || 0;
  return `${cantidad.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${item.unidadMedida}`;
}

/** Calcula precio final a partir de costo y recargo. Devuelve null si hay datos invalidos */
function calcPrecioFinal(costo, recargo) {
  if (isNaN(costo) || isNaN(recargo) || costo < 0 || recargo < 0) return null;
  return costo + (costo * recargo / 100);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseNumberFlexible(value) {
  const raw = String(value || '').trim().replace(/\s+/g, '');
  if (!raw) return NaN;

  if (raw.includes(',') && raw.includes('.')) {
    const commaPos = raw.lastIndexOf(',');
    const dotPos = raw.lastIndexOf('.');
    if (commaPos > dotPos) {
      return Number(raw.replace(/\./g, '').replace(',', '.'));
    }
    return Number(raw.replace(/,/g, ''));
  }

  if (raw.includes(',')) return Number(raw.replace(',', '.'));
  return Number(raw);
}

function normalizePrepUnit(unit) {
  const normalized = normalizeText(unit).replace(/\./g, '');
  if (!normalized) return null;

  if (/^(unidad|unidades|u|und|capsula|capsulas|caps)$/.test(normalized)) return 'Unidades';
  if (/^(g|gr|grs|gramo|gramos)$/.test(normalized)) return 'Gramos';
  if (/^(ml|mililitro|mililitros|cc)$/.test(normalized)) return 'Mililitros';
  return null;
}

/** Extrae cantidad y unidad base desde una presentacion textual (ej: "30 capsulas", "100 g", "50 ml") */
function parsePresentacionEstandar(presentacion) {
  const normalized = normalizeText(presentacion);
  if (!normalized) return null;

  const match = normalized.match(/(\d+(?:[.,]\d+)?)\s*([a-z]+)/);
  if (!match) return null;

  const cantidadBase = parseNumberFlexible(match[1]);
  const unidadBase = normalizePrepUnit(match[2]);

  if (!Number.isFinite(cantidadBase) || cantidadBase <= 0 || !unidadBase) return null;
  return { cantidadBase, unidadBase };
}

function setSelectedPrepFormulaBase(formulaNombre) {
  const target = String(formulaNombre || '').trim();
  if (!target) {
    selectedPrepFormulaBase = null;
    return;
  }

  const formula = findFormulaByName(target);
  if (!formula) {
    selectedPrepFormulaBase = null;
    return;
  }

  const parsedBase = parsePresentacionEstandar(formula.presentacion || formula.presentacion_estandar || '');
  const costoBase = Number(formula.costoEstimado);

  selectedPrepFormulaBase = {
    formulaId: formula.id,
    formulaNombre: formula.nombre || target,
    cantidadBase: parsedBase?.cantidadBase ?? null,
    unidadBase: parsedBase?.unidadBase ?? null,
    costoBase: Number.isFinite(costoBase) && costoBase >= 0 ? costoBase : null
  };
}

function calcCostoProporcional(cantidadSolicitada, unidadSolicitada, formulaBase) {
  if (!formulaBase) return 0;

  const cantidad = Number(cantidadSolicitada);
  if (!Number.isFinite(cantidad) || cantidad < 0) return 0;

  if (!Number.isFinite(formulaBase.costoBase) || formulaBase.costoBase < 0) return 0;
  if (!Number.isFinite(formulaBase.cantidadBase) || formulaBase.cantidadBase <= 0 || !formulaBase.unidadBase) return 0;

  const unidadSolicitadaNormalizada = normalizePrepUnit(unidadSolicitada);
  if (unidadSolicitadaNormalizada && unidadSolicitadaNormalizada !== formulaBase.unidadBase) return 0;

  const factor = cantidad / formulaBase.cantidadBase;
  if (!Number.isFinite(factor) || factor < 0) return 0;

  const costo = formulaBase.costoBase * factor;
  return Number.isFinite(costo) && costo >= 0 ? costo : 0;
}

function updateCostoProporcionalUI() {
  if (!costoInput) return;
  const costoCalculado = calcCostoProporcional(
    Number(cantidadInput?.value),
    unidadMedidaInput?.value,
    selectedPrepFormulaBase
  );

  costoInput.value = costoCalculado.toFixed(2);
  updatePrecioFinalUI();
}

/** Calcula si un item de stock tiene alerta de vencimiento proximo (default 7 dias) */
function isExpiringSoon(dateStr, daysWindow = 7) {
  const today = new Date();
  const target = new Date(dateStr);
  const diff = target.getTime() - today.getTime();
  const days = diff / (1000 * 60 * 60 * 24);
  return days <= daysWindow;
}

// ---- Helpers especificos de stock ----

function parseDateSafe(value) {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function isStockExpired(dateStr) {
  const date = parseDateSafe(dateStr);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return date < today;
}

function isStockExpiringSoon(dateStr, daysWindow = 30) {
  const date = parseDateSafe(dateStr);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + daysWindow);
  date.setHours(0, 0, 0, 0);
  return date >= today && date <= limit;
}

function isStockBelowMinimum(item) {
  const actual = Number(item.stock_actual);
  const minimo = Number(item.stock_minimo);
  if (isNaN(actual) || isNaN(minimo)) return false;
  return actual <= minimo;
}

function getStockFieldValue(item, ...keys) {
  if (!item) return '';
  const foundKey = keys.find((key) => item[key] !== undefined && item[key] !== null);
  return foundKey ? item[foundKey] : '';
}

function normalizeDateForInput(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function setStockEditFieldValue(fieldName, value) {
  if (!stockEditForm) return;
  const field = stockEditForm.elements.namedItem(fieldName);
  if (!field || !('value' in field)) return;
  field.value = value ?? '';
}

function openStockEditModal(item) {
  if (!stockEditModal || !stockEditForm) return;

  const stockId = getStockFieldValue(item, 'id');
  const stockActual = getStockFieldValue(item, 'stock_actual', 'stockActual');
  const stockMinimo = getStockFieldValue(item, 'stock_minimo', 'stockMinimo');
  const costoUnitario = getStockFieldValue(item, 'costo_unitario', 'costoUnitario');
  const lote = getStockFieldValue(item, 'lote');
  const proveedor = getStockFieldValue(item, 'proveedor');
  const fechaVencimiento = getStockFieldValue(item, 'fecha_vencimiento', 'fechaVencimiento');

  setStockEditFieldValue('stockId', stockId);
  setStockEditFieldValue('stock_actual', stockActual);
  setStockEditFieldValue('stock_minimo', stockMinimo);
  setStockEditFieldValue('costo_unitario', costoUnitario);
  setStockEditFieldValue('lote', lote);
  setStockEditFieldValue('proveedor', proveedor);
  setStockEditFieldValue('fecha_vencimiento', normalizeDateForInput(fechaVencimiento));

  stockEditModal.classList.remove('hidden');
}

function closeStockEditModal() {
  if (!stockEditModal || !stockEditForm) return;
  stockEditModal.classList.add('hidden');
  stockEditForm.reset();
}

/** Heuristica simple para marcar stock bajo segun unidad */
function isLowStock(item) {
  const thresholds = { Unidades: 10, Gramos: 200, Mililitros: 200 };
  const limite = thresholds[item.unidadMedida] ?? 10;
  return Number(item.cantidad) <= limite;
}

/** Genera HTML de opciones de materias primas */
function buildMateriaOptions(selectedId) {
  if (!state.stockItems.length) {
    return '<option value="">Cargá materias primas en Stock</option>';
  }
  return state.stockItems
    .map((item) => {
      const selected = String(item.id) === String(selectedId) ? 'selected' : '';
      return `<option value="${item.id}" ${selected}>${item.nombre} — ${item.unidad_base || ''}</option>`;
    })
    .join('');
}

/** Crea un nodo de fila de componente vinculado a materias primas reales */
function createIngredientRow(data = {}) {
  const row = document.createElement('div');
  row.className = 'ingredient-row';
  const opciones = buildMateriaOptions(data.materia_prima_id);
  const unidad = data.unidad || (state.stockItems.find((m) => String(m.id) === String(data.materia_prima_id))?.unidad_base) || 'Gramos';

  row.innerHTML = `
    <select name="ingMateriaId" required ${state.stockItems.length ? '' : 'disabled'}>
      <option value="" disabled ${data.materia_prima_id ? '' : 'selected'}>Seleccioná materia prima</option>
      ${opciones}
    </select>
    <input type="number" name="ingCantidad" min="0.01" step="0.01" placeholder="Cantidad" value="${data.cantidad ?? ''}" required>
    <select name="ingUnidad" required>
      <option value="Gramos" ${unidad === 'Gramos' ? 'selected' : ''}>Gramos</option>
      <option value="Mililitros" ${unidad === 'Mililitros' ? 'selected' : ''}>Mililitros</option>
      <option value="Unidades" ${unidad === 'Unidades' ? 'selected' : ''}>Unidades</option>
    </select>
    <input type="text" name="ingObs" placeholder="Observaciones" value="${data.observaciones || ''}">
    <button type="button" class="remove-ingredient">Quitar</button>
  `;

  const removeBtn = row.querySelector('.remove-ingredient');
  removeBtn.addEventListener('click', () => {
    row.remove();
    updateFormulaCostUI();
  });

  const cantidadInput = row.querySelector('input[name="ingCantidad"]');
  const materiaSelect = row.querySelector('select[name="ingMateriaId"]');

  cantidadInput?.addEventListener('input', updateFormulaCostUI);
  materiaSelect?.addEventListener('change', updateFormulaCostUI);

  return row;
}

/** Actualiza los selects de materia prima existentes con el catalogo actual */
function refreshIngredientRowsOptions() {
  if (!ingredientsContainer) return;
  const rows = ingredientsContainer.querySelectorAll('.ingredient-row');
  rows.forEach((row) => {
    const select = row.querySelector('select[name="ingMateriaId"]');
    if (!select) return;
    const current = select.value;
    select.innerHTML = `
      <option value="" disabled ${current ? '' : 'selected'}>Seleccioná materia prima</option>
      ${buildMateriaOptions(current)}
    `;
    select.disabled = state.stockItems.length === 0;
    if (current) select.value = current;
  });
}

/** Cambia estado y ejecuta automatizacion de stock segun transicion */
async function changePreparadoStatus(id, nextStatus) {
  const item = state.items.find((p) => normalizeId(p.id) === normalizeId(id));
  if (!item) return;
  if (!STATUS_FLOW.includes(nextStatus)) return;
  if (item.status === nextStatus) return;

  const requiereAplicar = STOCK_IMPACT_STATUSES.has(nextStatus) && !Boolean(item.stockAplicado);
  const requiereRevertir = !STOCK_IMPACT_STATUSES.has(nextStatus) && Boolean(item.stockAplicado);
  let reversionEntries = [];
  let aplicacionEntries = [];

  if (requiereRevertir) {
    const reversion = await revertStockForPreparado(item, {
      motivo: `Reversion por cambio de estado ${item.status} -> ${nextStatus}`
    });
    if (!reversion.ok) {
      alert(reversion.error || 'No se pudo devolver stock al volver a Pendiente.');
      return;
    }
    reversionEntries = reversion.entries || [];
  }

  if (requiereAplicar) {
    const aplicacion = await applyStockForPreparado(item, {
      motivo: `Descuento por cambio de estado ${item.status} -> ${nextStatus}`
    });
    if (!aplicacion.ok) {
      alert(aplicacion.error || 'No se pudo descontar stock en el cambio de estado.');
      return;
    }
    aplicacionEntries = aplicacion.entries || [];
  }

  const stockAplicadoFinal = STOCK_IMPACT_STATUSES.has(nextStatus);
  const { error } = await supabaseClient
    .from('preparados')
    .update({
      estado: nextStatus,
      stock_aplicado: stockAplicadoFinal
    })
    .eq('id', id);

  if (error) {
    console.error('Error actualizando estado en Supabase:', error);

    if (requiereAplicar) {
      if (aplicacionEntries.length) {
        await processStockEntries({
          preparado: item,
          entries: aplicacionEntries,
          tipoMovimiento: MOVIMIENTO_STOCK_REVERSION,
          stockDeltaSign: 1,
          motivo: `Rollback por fallo guardando estado ${item.status} -> ${nextStatus}`,
          source: 'rollback'
        });
      } else {
        await revertStockForPreparado(item, {
          motivo: `Rollback por fallo guardando estado ${item.status} -> ${nextStatus}`
        });
      }
    } else if (requiereRevertir) {
      if (reversionEntries.length) {
        await processStockEntries({
          preparado: item,
          entries: reversionEntries,
          tipoMovimiento: MOVIMIENTO_STOCK_CONSUMO,
          stockDeltaSign: -1,
          motivo: `Rollback por fallo guardando estado ${item.status} -> ${nextStatus}`,
          source: 'rollback'
        });
      } else {
        await applyStockForPreparado(item, {
          motivo: `Rollback por fallo guardando estado ${item.status} -> ${nextStatus}`
        });
      }
    }

    alert('No se pudo actualizar el estado.');
    return;
  }

  item.status = nextStatus;
  item.stockAplicado = stockAplicadoFinal;
  renderList(searchInput?.value || '');
}

/** Avanza el estado de un preparado respetando el flujo definido */
async function advanceStatus(id) {
  const item = state.items.find((p) => normalizeId(p.id) === normalizeId(id));
  if (!item) return;

  const currentIndex = STATUS_FLOW.indexOf(item.status);
  if (currentIndex >= STATUS_FLOW.length - 1) return;

  const nextStatus = STATUS_FLOW[currentIndex + 1];
  await changePreparadoStatus(id, nextStatus);
}

/** Filtra por cualquier campo textual usando el termino ingresado */
function matchesSearch(item, term) {
  if (!term) return true;
  const target = [
    item.cliente,
    item.formula,
    item.cantidad,
    item.fechaCarga,
    item.diaEntrega,
    item.observaciones,
    item.status,
    item.formaFarmaceutica,
    item.unidadMedida,
    item.costo,
    item.recargo,
    item.precioFinal,
    item.pdf ? item.pdf.name : ''
  ].join(' ').toLowerCase();
  return target.includes(term.toLowerCase());
}

/** Filtra formulas buscando en nombre, forma, presentacion e ingredientes */
function matchesFormulaSearch(item, term) {
  if (!term) return true;
  const ingText = (item.ingredientes || [])
    .map((ing) => `${ing.nombre} ${ing.cantidad} ${ing.unidad}`)
    .join(' ');
  const target = [
    item.nombre,
    item.forma,
    item.presentacion,
    ingText
  ].join(' ').toLowerCase();
  return target.includes(term.toLowerCase());
}

/** Calcula el costo total de una formula a partir de sus componentes */
function calcFormulaCost(componentes = [], materiaMapOverride) {
  const materiaMap = materiaMapOverride || new Map(state.stockItems.map((m) => [String(m.id), m]));
  return componentes.reduce((acc, comp) => {
    const materia = materiaMap.get(String(comp.materia_prima_id));
    const costoUnitario = materia ? Number(materia.costo_unitario) : Number(comp.costo_unitario ?? 0);
    const cantidad = Number(comp.cantidad) || 0;
    if (!isNaN(costoUnitario) && !isNaN(cantidad)) {
      acc += cantidad * costoUnitario;
    }
    return acc;
  }, 0);
}

/** Devuelve una formula por nombre (case-insensitive) */
function findFormulaByName(nombre) {
  if (!nombre) return null;
  const normalized = nombre.trim().toLowerCase();
  return state.formulas.find((f) => f.nombre?.trim().toLowerCase() === normalized) || null;
}

/** Normaliza IDs para comparaciones seguras entre string y number */
function normalizeId(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function sanitizeStorageFileName(fileName) {
  const normalized = String(fileName || 'receta.pdf')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || `receta_${Date.now()}.pdf`;
}

function sanitizeStorageSegment(value) {
  const normalized = String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'preparado';
}

function buildRecetaStoragePath(preparadoId, fileName) {
  const safePreparadoId = sanitizeStorageSegment(preparadoId);
  const safeFileName = sanitizeStorageFileName(fileName);
  return `${safePreparadoId}/${safePreparadoId}_${Date.now()}_${safeFileName}`;
}

function getPublicUrlForRecetaPath(path) {
  const recetaPath = String(path || '').trim();
  if (!recetaPath) return '';
  const { data } = supabaseClient
    .storage
    .from(PREPARADOS_RECETAS_BUCKET)
    .getPublicUrl(recetaPath);
  return data?.publicUrl || '';
}

function buildRecetaData({ nombre, path, url } = {}) {
  const recetaPath = String(path || '').trim();
  const recetaUrl = String(url || '').trim() || getPublicUrlForRecetaPath(recetaPath);
  const recetaNombre = String(nombre || '').trim()
    || (recetaPath ? recetaPath.split('/').pop() : '')
    || 'receta.pdf';

  if (!recetaPath && !recetaUrl) return null;

  return {
    name: recetaNombre,
    path: recetaPath,
    url: recetaUrl
  };
}

async function uploadRecetaToStorage(preparadoId, file) {
  if (!file || Number(file.size) <= 0) {
    return { ok: false, error: new Error('Archivo de receta invalido.') };
  }

  const path = buildRecetaStoragePath(preparadoId, file.name);
  const { error: uploadError } = await supabaseClient
    .storage
    .from(PREPARADOS_RECETAS_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/pdf'
    });

  if (uploadError) {
    return { ok: false, error: uploadError };
  }

  const url = getPublicUrlForRecetaPath(path);
  if (!url) {
    await supabaseClient.storage.from(PREPARADOS_RECETAS_BUCKET).remove([path]);
    return { ok: false, error: new Error('No se pudo obtener la URL publica de la receta.') };
  }

  return {
    ok: true,
    data: {
      name: file.name || sanitizeStorageFileName(path),
      path,
      url
    }
  };
}

async function removeRecetaFromStorage(path) {
  const recetaPath = String(path || '').trim();
  if (!recetaPath) return { ok: true };

  const { error } = await supabaseClient
    .storage
    .from(PREPARADOS_RECETAS_BUCKET)
    .remove([recetaPath]);

  if (error) return { ok: false, error };
  return { ok: true };
}

/** Devuelve una formula por id sin depender del tipo */
function findFormulaById(id) {
  const targetId = normalizeId(id);
  if (!targetId) return null;
  return state.formulas.find((f) => normalizeId(f.id) === targetId) || null;
}

function toPositiveStockAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  return Number(Math.abs(parsed).toFixed(6));
}

function hasPreparedStockInputsChanged(previousItem, nextItem) {
  if (!previousItem || !nextItem) return false;

  const prevFormula = normalizeText(previousItem.formula);
  const nextFormula = normalizeText(nextItem.formula);
  if (prevFormula !== nextFormula) return true;

  const prevCantidad = Number(previousItem.cantidad);
  const nextCantidad = Number(nextItem.cantidad);
  const prevCantidadNormalizada = Number.isFinite(prevCantidad) ? Number(prevCantidad.toFixed(6)) : NaN;
  const nextCantidadNormalizada = Number.isFinite(nextCantidad) ? Number(nextCantidad.toFixed(6)) : NaN;
  if (prevCantidadNormalizada !== nextCantidadNormalizada) return true;

  const prevUnidad = normalizePrepUnit(previousItem.unidadMedida) || normalizeText(previousItem.unidadMedida);
  const nextUnidad = normalizePrepUnit(nextItem.unidadMedida) || normalizeText(nextItem.unidadMedida);
  return prevUnidad !== nextUnidad;
}

function calculateFormulaConsumptionForPreparado(preparado) {
  if (!preparado) {
    return { ok: false, error: 'No hay datos del preparado para calcular stock.' };
  }

  const formula = findFormulaByName(preparado.formula);
  if (!formula) {
    return { ok: false, error: `No se encontro la formula "${preparado.formula}" para calcular stock.` };
  }

  const presentacion = formula.presentacion || formula.presentacion_estandar || '';
  const base = parsePresentacionEstandar(presentacion);
  if (!base) {
    return { ok: false, error: `La formula "${formula.nombre}" no tiene una presentacion estandar valida.` };
  }

  const cantidadPreparado = Number(preparado.cantidad);
  if (!Number.isFinite(cantidadPreparado) || cantidadPreparado <= 0) {
    return { ok: false, error: 'La cantidad del preparado no es valida para calcular consumo.' };
  }

  const unidadPreparado = normalizePrepUnit(preparado.unidadMedida);
  if (!unidadPreparado) {
    return { ok: false, error: 'La unidad del preparado no es valida para calcular consumo.' };
  }

  if (unidadPreparado !== base.unidadBase) {
    return {
      ok: false,
      error: `La unidad del preparado (${preparado.unidadMedida}) no coincide con la presentacion base de la formula (${base.unidadBase}).`
    };
  }

  const factor = cantidadPreparado / base.cantidadBase;
  if (!Number.isFinite(factor) || factor <= 0) {
    return { ok: false, error: 'No se pudo calcular factor proporcional para el consumo de stock.' };
  }

  const materiaMap = new Map(state.stockItems.map((m) => [normalizeId(m.id), m]));
  const componentes = Array.isArray(formula.ingredientes) ? formula.ingredientes : [];
  if (!componentes.length) {
    return { ok: false, error: `La formula "${formula.nombre}" no tiene componentes cargados.` };
  }

  const entries = [];
  for (const componente of componentes) {
    const materiaId = normalizeId(componente.materia_prima_id);
    const cantidadBase = Number(componente.cantidad);
    if (!materiaId || !Number.isFinite(cantidadBase) || cantidadBase <= 0) {
      return { ok: false, error: `La formula "${formula.nombre}" tiene componentes invalidos para stock.` };
    }

    const cantidadReal = toPositiveStockAmount(cantidadBase * factor);
    if (!Number.isFinite(cantidadReal) || cantidadReal <= 0) continue;

    const materia = materiaMap.get(materiaId);
    const unidad = componente.unidad || materia?.unidad_base || '';

    entries.push({
      materia_prima_id: materiaId,
      cantidad: cantidadReal,
      unidad,
      nombre_materia: materia?.nombre || componente.nombre || `Materia #${materiaId}`
    });
  }

  if (!entries.length) {
    return { ok: false, error: `No se pudo obtener consumo real para la formula "${formula.nombre}".` };
  }

  return { ok: true, entries, factor, formula };
}

async function fetchNetAppliedConsumptionFromMovements(preparadoId) {
  const id = normalizeId(preparadoId);
  if (!id) return { ok: true, entries: [] };

  const { data, error } = await supabaseClient
    .from('movimientos_stock')
    .select('materia_prima_id, tipo_movimiento, cantidad, unidad')
    .eq('preparado_id', id);

  if (error) {
    console.error('Error leyendo movimientos de stock:', error);
    return { ok: false, error: 'No se pudo leer movimientos de stock para revertir.' };
  }

  const materiaMap = new Map(state.stockItems.map((m) => [normalizeId(m.id), m]));
  const balance = new Map();

  for (const movimiento of data || []) {
    const materiaId = normalizeId(movimiento.materia_prima_id);
    if (!materiaId) continue;

    const cantidad = toPositiveStockAmount(movimiento.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) continue;

    const tipo = String(movimiento.tipo_movimiento || '').trim();
    const signo = tipo === MOVIMIENTO_STOCK_CONSUMO ? 1 : tipo === MOVIMIENTO_STOCK_REVERSION ? -1 : 0;
    if (!signo) continue;

    const current = balance.get(materiaId) || {
      materia_prima_id: materiaId,
      cantidad: 0,
      unidad: movimiento.unidad || materiaMap.get(materiaId)?.unidad_base || '',
      nombre_materia: materiaMap.get(materiaId)?.nombre || `Materia #${materiaId}`
    };

    current.cantidad += signo * cantidad;
    if (!current.unidad) {
      current.unidad = movimiento.unidad || materiaMap.get(materiaId)?.unidad_base || '';
    }
    balance.set(materiaId, current);
  }

  const entries = Array.from(balance.values())
    .filter((entry) => entry.cantidad > 0)
    .map((entry) => ({
      ...entry,
      cantidad: Number(entry.cantidad.toFixed(6))
    }));

  return { ok: true, entries };
}

async function resolveConsumptionForReversion(preparado) {
  const fromMovimientos = await fetchNetAppliedConsumptionFromMovements(preparado?.id);
  if (!fromMovimientos.ok) return fromMovimientos;
  if (fromMovimientos.entries.length) {
    return {
      ok: true,
      entries: fromMovimientos.entries,
      source: 'movimientos'
    };
  }

  const fromFormula = calculateFormulaConsumptionForPreparado(preparado);
  if (!fromFormula.ok) return fromFormula;

  return {
    ok: true,
    entries: fromFormula.entries,
    source: 'formula',
    factor: fromFormula.factor
  };
}

async function rollbackMateriaStocks(snapshotMap) {
  if (!(snapshotMap instanceof Map) || !snapshotMap.size) return;

  for (const [materiaId, stockAnterior] of snapshotMap.entries()) {
    const { error } = await supabaseClient
      .from('materias_primas')
      .update({ stock_actual: stockAnterior })
      .eq('id', materiaId);

    if (error) {
      console.error(`Error revirtiendo stock de materia prima ${materiaId}:`, error);
    }
  }
}

function applyLocalMateriaStocks(nextStocksById) {
  if (!(nextStocksById instanceof Map) || !nextStocksById.size) return;

  state.stockItems = state.stockItems.map((item) => {
    const materiaId = normalizeId(item.id);
    if (!nextStocksById.has(materiaId)) return item;
    return {
      ...item,
      stock_actual: nextStocksById.get(materiaId)
    };
  });

  renderStockList(stockSearch?.value || '');
  renderDashboardAlerts();
  refreshIngredientRowsOptions();
}

async function processStockEntries({
  preparado,
  entries,
  tipoMovimiento,
  stockDeltaSign,
  motivo,
  source,
  factor
}) {
  const preparadoId = normalizeId(preparado?.id);
  if (!preparadoId) {
    return { ok: false, error: 'El preparado no tiene ID valido para registrar movimientos de stock.' };
  }

  const cleanEntries = (entries || [])
    .map((entry) => {
      const materiaId = normalizeId(entry.materia_prima_id);
      const cantidad = toPositiveStockAmount(entry.cantidad);
      if (!materiaId || !Number.isFinite(cantidad) || cantidad <= 0) return null;
      return {
        materia_prima_id: materiaId,
        cantidad,
        unidad: entry.unidad || '',
        nombre_materia: entry.nombre_materia || ''
      };
    })
    .filter(Boolean);

  if (!cleanEntries.length) return { ok: true, entries: [] };

  const materiaMap = await getMateriaMapFresh();
  const totalPorMateria = new Map();

  for (const entry of cleanEntries) {
    const current = totalPorMateria.get(entry.materia_prima_id) || 0;
    totalPorMateria.set(entry.materia_prima_id, Number((current + entry.cantidad).toFixed(6)));
  }

  const updates = [];
  for (const [materiaId, cantidadTotal] of totalPorMateria.entries()) {
    const materia = materiaMap.get(materiaId);
    if (!materia) {
      return { ok: false, error: `No se encontro la materia prima #${materiaId} para impactar stock.` };
    }

    const stockActual = Number(materia.stock_actual) || 0;
    const stockNuevo = Number((stockActual + (stockDeltaSign * cantidadTotal)).toFixed(6));
    updates.push({ materiaId, stockActual, stockNuevo });
  }

  const snapshotMap = new Map();
  const nextStocksById = new Map();

  for (const update of updates) {
    snapshotMap.set(update.materiaId, update.stockActual);
    const { error } = await supabaseClient
      .from('materias_primas')
      .update({ stock_actual: update.stockNuevo })
      .eq('id', update.materiaId);

    if (error) {
      console.error('Error actualizando stock de materias primas:', error);
      await rollbackMateriaStocks(snapshotMap);
      return { ok: false, error: 'No se pudo actualizar stock de materias primas.' };
    }

    nextStocksById.set(update.materiaId, update.stockNuevo);
  }

  const observacionBase = [
    motivo || '',
    `Preparado #${preparadoId}`,
    preparado?.formula ? `Formula: ${preparado.formula}` : '',
    source ? `Fuente: ${source}` : '',
    Number.isFinite(factor) ? `Factor: ${Number(factor).toFixed(6)}` : ''
  ]
    .filter(Boolean)
    .join(' | ');

  const movimientosPayload = cleanEntries.map((entry) => {
    const materia = materiaMap.get(entry.materia_prima_id);
    const unidad = entry.unidad || materia?.unidad_base || '';
    const detalleMateria = entry.nombre_materia || materia?.nombre || '';

    return {
      materia_prima_id: entry.materia_prima_id,
      preparado_id: preparadoId,
      tipo_movimiento: tipoMovimiento,
      cantidad: entry.cantidad,
      unidad,
      observaciones: [observacionBase, detalleMateria ? `Materia: ${detalleMateria}` : '']
        .filter(Boolean)
        .join(' | ')
    };
  });

  if (movimientosPayload.length) {
    const { error: movimientosError } = await supabaseClient
      .from('movimientos_stock')
      .insert(movimientosPayload);

    if (movimientosError) {
      console.error('Error registrando movimientos de stock:', movimientosError);
      await rollbackMateriaStocks(snapshotMap);
      return { ok: false, error: 'No se pudo registrar movimientos de stock.' };
    }
  }

  applyLocalMateriaStocks(nextStocksById);
  return { ok: true, entries: cleanEntries };
}

async function applyStockForPreparado(preparado, options = {}) {
  const consumption = calculateFormulaConsumptionForPreparado(preparado);
  if (!consumption.ok) return consumption;

  return processStockEntries({
    preparado,
    entries: consumption.entries,
    tipoMovimiento: MOVIMIENTO_STOCK_CONSUMO,
    stockDeltaSign: -1,
    motivo: options.motivo || 'Descuento automatico de stock',
    source: 'formula',
    factor: consumption.factor
  });
}

async function revertStockForPreparado(preparado, options = {}) {
  const consumption = await resolveConsumptionForReversion(preparado);
  if (!consumption.ok) return consumption;

  return processStockEntries({
    preparado,
    entries: consumption.entries,
    tipoMovimiento: MOVIMIENTO_STOCK_REVERSION,
    stockDeltaSign: 1,
    motivo: options.motivo || 'Reversion automatica de stock',
    source: consumption.source || 'formula',
    factor: consumption.factor
  });
}

/** Completa el campo costo segun el costo estimado de la formula elegida */
function autofillCostoDesdeFormula(nombre) {
  if (!costoInput) return;
  setSelectedPrepFormulaBase(nombre);
  if (selectedPrepFormulaBase?.unidadBase && unidadMedidaInput) {
    unidadMedidaInput.value = selectedPrepFormulaBase.unidadBase;
  }
  updateCostoProporcionalUI();
}

/** Recalcula costo estimado y lo muestra en el formulario */
function updateFormulaCostUI() {
  if (!formulaCostLabel || !ingredientsContainer) return;
  const rows = Array.from(ingredientsContainer.querySelectorAll('.ingredient-row'));
  const materiaMap = new Map(state.stockItems.map((m) => [String(m.id), m]));
  const total = rows.reduce((acc, row) => {
    const materiaId = row.querySelector('select[name="ingMateriaId"]')?.value;
    const cantidad = Number(row.querySelector('input[name="ingCantidad"]')?.value);
    if (!materiaId || isNaN(cantidad)) return acc;
    const materia = materiaMap.get(String(materiaId));
    const costoUnit = Number(materia?.costo_unitario);
    if (isNaN(costoUnit)) return acc;
    return acc + cantidad * costoUnit;
  }, 0);
  formulaCostLabel.textContent = `$${total.toFixed(2)}`;
}

// ---- Render de interfaz ----

function renderEmptyState() {
  return `
    <div class="empty-state" role="status" aria-live="polite">
      <span class="empty-state-icon" aria-hidden="true">+</span>
      <p class="empty-state-title">No hay datos todav&iacute;a</p>
      <p class="empty-state-subtitle">Agreg&aacute; tu primer elemento para comenzar</p>
    </div>
  `;
}

function uiIcon(name, sizeClass = 'ui-icon-sm') {
  return `<svg class="ui-icon ${sizeClass}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}

function formatDashboardDate(dateStr) {
  const parsed = parseDateSafe(dateStr);
  if (!parsed) return '-';
  return parsed.toLocaleDateString('es-AR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function renderDashboardAlertEmpty(message) {
  return `
    <div class="dashboard-alert-empty">
      <span class="dashboard-alert-empty-icon" aria-hidden="true">+</span>
      <p>${message}</p>
    </div>
  `;
}

function renderDashboardAlerts() {
  if (!dashboardLowStockList || !dashboardExpiringList) return;

  const stockItems = Array.isArray(state.stockItems) ? state.stockItems : [];
  const lowStockItems = stockItems
    .filter((item) => isStockBelowMinimum(item))
    .sort((a, b) => (Number(a.stock_actual) || 0) - (Number(b.stock_actual) || 0));

  const expiringItems = stockItems
    .filter((item) => isStockExpiringSoon(item.fecha_vencimiento, 30))
    .sort((a, b) => {
      const aTime = parseDateSafe(a.fecha_vencimiento)?.getTime() || Number.MAX_SAFE_INTEGER;
      const bTime = parseDateSafe(b.fecha_vencimiento)?.getTime() || Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });

  dashboardLowStockCount.textContent = String(lowStockItems.length);
  dashboardExpiringCount.textContent = String(expiringItems.length);

  if (!lowStockItems.length) {
    dashboardLowStockList.innerHTML = renderDashboardAlertEmpty('Sin alertas de stock bajo');
  } else {
    dashboardLowStockList.innerHTML = lowStockItems.map((item) => `
      <article class="dashboard-alert-item">
        <div class="dashboard-alert-item-top">
          <strong>${item.nombre || 'Materia prima'}</strong>
          ${item.lote ? `<span class="dashboard-alert-lote">Lote ${item.lote}</span>` : ''}
        </div>
        <div class="dashboard-alert-item-meta">
          <span>Actual: <strong>${Number(item.stock_actual || 0)} ${item.unidad_base || ''}</strong></span>
          <span>Minimo: <strong>${Number(item.stock_minimo || 0)} ${item.unidad_base || ''}</strong></span>
        </div>
      </article>
    `).join('');
  }

  if (!expiringItems.length) {
    dashboardExpiringList.innerHTML = renderDashboardAlertEmpty('Sin materias primas proximas a vencer');
  } else {
    dashboardExpiringList.innerHTML = expiringItems.map((item) => `
      <article class="dashboard-alert-item">
        <div class="dashboard-alert-item-top">
          <strong>${item.nombre || 'Materia prima'}</strong>
          ${item.lote ? `<span class="dashboard-alert-lote">Lote ${item.lote}</span>` : ''}
        </div>
        <div class="dashboard-alert-item-meta">
          <span>Vence: <strong>${formatDashboardDate(item.fecha_vencimiento)}</strong></span>
          <span>Cantidad: <strong>${Number(item.stock_actual || 0)} ${item.unidad_base || ''}</strong></span>
        </div>
      </article>
    `).join('');
  }
}

/** Renderiza la lista de preparados aplicando filtro de busqueda */
function renderList(term = '') {
  listContainer.innerHTML = '';
  const filtered = state.items
    .filter((item) => matchesSearch(item, term))
    .sort((a, b) => b.createdAt - a.createdAt);

  if (!filtered.length) {
    listContainer.innerHTML = renderEmptyState();
    return;
  }

  filtered.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'prep-card';
    card.dataset.status = item.status;

    const nextIndex = STATUS_FLOW.indexOf(item.status) + 1;
    const nextLabel = STATUS_FLOW[nextIndex] ? `Avanzar a ${STATUS_FLOW[nextIndex]}` : 'Estado final';

    card.innerHTML = `
      <div class="prep-card-head">
        <div class="prep-title-wrap">
          <span class="pill status status-${item.status.toLowerCase()}">${item.status}</span>
          <span class="prep-client">${uiIcon('user', 'ui-icon-md')}${item.cliente}</span>
        </div>
        <div class="prep-chips">
          <span class="badge prep-chip">${uiIcon('flask', 'ui-icon-xs')}${item.formula}</span>
          <span class="badge prep-chip">${item.formaFarmaceutica}</span>
        </div>
      </div>
      <div class="prep-metrics">
        <div class="metric">
          <span class="metric-label">Cantidad</span>
          <strong>${formatCantidad(item)}</strong>
        </div>
        <div class="metric">
          <span class="metric-label">${uiIcon('calendar', 'ui-icon-xs')}Carga</span>
          <strong>${item.fechaCarga}</strong>
        </div>
        <div class="metric">
          <span class="metric-label">${uiIcon('calendar', 'ui-icon-xs')}Entrega</span>
          <strong>${item.diaEntrega}</strong>
        </div>
        <div class="metric">
          <span class="metric-label">Costo</span>
          <strong>$${(item.costo ?? 0).toFixed ? item.costo.toFixed(2) : Number(item.costo).toFixed(2)}</strong>
        </div>
        <div class="metric">
          <span class="metric-label">Recargo</span>
          <strong>${(item.recargo ?? 0)}%</strong>
        </div>
        <div class="metric metric-highlight">
          <span class="metric-label">${uiIcon('money', 'ui-icon-xs')}Precio final</span>
          <strong>$${(item.precioFinal ?? 0).toFixed ? item.precioFinal.toFixed(2) : Number(item.precioFinal).toFixed(2)}</strong>
        </div>
      </div>
      <p class="meta prep-notes">Notas: ${item.observaciones || 'Sin observaciones'}</p>
      <div class="prep-card-footer">
        <div class="meta prep-pdf">
          PDF: ${item.pdf && item.pdf.url
      ? `<span>${item.pdf.name}</span> &middot; <a class="pdf-link" href="${item.pdf.url}" target="_blank" rel="noopener">Ver receta</a> &middot; <a class="pdf-link" href="${item.pdf.url}" download="${sanitizeStorageFileName(item.pdf.name)}">Descargar receta</a> &middot; <button type="button" class="pdf-link pdf-delete-link" data-action="delete-receta">Eliminar receta</button>`
      : 'No adjuntado'}
        </div>

        <div class="actions">
          <button class="btn primary" data-action="advance" ${item.status === 'Entregado' ? 'disabled' : ''}>${nextLabel}</button>
          ${item.status !== 'Pendiente' ? '<button class="btn secondary" data-action="to-pending">Volver a Pendiente</button>' : ''}
          <button class="btn secondary" data-action="edit">Editar</button>
          <button class="btn danger" data-action="delete">Eliminar</button>
        </div>
      </div>
    `;

    const advanceBtn = card.querySelector('[data-action="advance"]');
if (advanceBtn) {
  advanceBtn.addEventListener('click', () => advanceStatus(item.id));
}

const editBtn = card.querySelector('[data-action="edit"]');
if (editBtn) {
  editBtn.addEventListener('click', () => editPreparado(item.id));
}

const toPendingBtn = card.querySelector('[data-action="to-pending"]');
if (toPendingBtn) {
  toPendingBtn.addEventListener('click', () => changePreparadoStatus(item.id, 'Pendiente'));
}

const deleteBtn = card.querySelector('[data-action="delete"]');
if (deleteBtn) {
  deleteBtn.addEventListener('click', () => deletePreparado(item.id));
}

const deleteRecetaBtn = card.querySelector('[data-action="delete-receta"]');
if (deleteRecetaBtn) {
  deleteRecetaBtn.addEventListener('click', () => deletePreparadoReceta(item.id));
}

    listContainer.appendChild(card);
  });
  function editPreparado(id) {
  const item = state.items.find(item => item.id === id);
  if (!item) return;

  state.editingId = id;

  form.cliente.value = item.cliente || '';
  form.formula.value = item.formula || '';
  form.cantidad.value = item.cantidad || '';
  form.formaFarmaceutica.value = item.formaFarmaceutica || '';
  form.unidadMedida.value = item.unidadMedida || '';
  form.fechaCarga.value = item.fechaCarga || '';
  form.diaEntrega.value = item.diaEntrega || '';
  form.observaciones.value = item.observaciones || '';
  form.recargo.value = item.recargo ?? '';
  autofillCostoDesdeFormula(form.formula.value);

  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
}

async function deletePreparadoReceta(id) {
  const item = state.items.find((prep) => normalizeId(prep.id) === normalizeId(id));
  const recetaPath = item?.pdf?.path || '';

  if (!item || !recetaPath) {
    alert('Este preparado no tiene receta adjunta.');
    return;
  }

  const confirmar = confirm('Seguro que queres eliminar la receta adjunta?');
  if (!confirmar) return;

  const storageResult = await removeRecetaFromStorage(recetaPath);
  if (!storageResult.ok) {
    console.error('No se pudo eliminar la receta del storage:', storageResult.error);
    alert('No se pudo eliminar la receta del storage. Intenta nuevamente.');
    return;
  }

  const { error } = await supabaseClient
    .from('preparados')
    .update({
      archivo_receta_nombre: null,
      archivo_receta_path: null,
      archivo_receta_url: null
    })
    .eq('id', id);

  if (error) {
    console.error('No se pudo limpiar la receta en la base de datos:', error);
    alert('La receta se elimino del storage, pero no se pudo actualizar el preparado en la base de datos.');
    return;
  }

  state.items = state.items.map((prep) => {
    if (normalizeId(prep.id) !== normalizeId(id)) return prep;
    return { ...prep, pdf: null };
  });

  renderList(searchInput?.value || '');
  alert('Receta eliminada correctamente.');
}

async function deletePreparado(id) {
  const item = state.items.find((prep) => normalizeId(prep.id) === normalizeId(id));
  const recetaPath = item?.pdf?.path || '';
  const confirmar = confirm('Quieres eliminar este preparado?');
  if (!confirmar) return;

  let reversionAplicada = false;
  let reversionEntries = [];
  if (item?.stockAplicado) {
    const reversion = await revertStockForPreparado(item, {
      motivo: 'Reversion por eliminacion de preparado'
    });

    if (!reversion.ok) {
      alert(reversion.error || 'No se pudo devolver stock antes de eliminar el preparado.');
      return;
    }

    reversionAplicada = true;
    reversionEntries = reversion.entries || [];
  }

  const { error } = await supabaseClient
    .from('preparados')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error eliminando en Supabase:', error);

    if (reversionAplicada && item) {
      if (reversionEntries.length) {
        await processStockEntries({
          preparado: item,
          entries: reversionEntries,
          tipoMovimiento: MOVIMIENTO_STOCK_CONSUMO,
          stockDeltaSign: -1,
          motivo: 'Rollback por fallo al eliminar preparado',
          source: 'rollback'
        });
      } else {
        await applyStockForPreparado(item, {
          motivo: 'Rollback por fallo al eliminar preparado'
        });
      }
    }

    alert('No se pudo eliminar el preparado.');
    return;
  }

  let recetaDeleteWarning = '';
  if (recetaPath) {
    const recetaDeleteResult = await removeRecetaFromStorage(recetaPath);
    if (!recetaDeleteResult.ok) {
      console.error('No se pudo eliminar la receta del storage:', recetaDeleteResult.error);
      recetaDeleteWarning = ' Se elimino el preparado, pero no se pudo eliminar la receta del storage.';
    }
  }

  state.items = state.items.filter((prep) => normalizeId(prep.id) !== normalizeId(id));
  renderList(searchInput?.value || '');
  alert(`Preparado eliminado correctamente.${recetaDeleteWarning}`);
}


function renderStockList(filter = '') {
  if (!stockList) return;

  const query = String(filter).toLowerCase().trim();

  const filtered = state.stockItems.filter(item => {
    const texto = [
      item.nombre,
      item.lote,
      item.proveedor,
      item.fecha_vencimiento,
      item.unidad_base
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return texto.includes(query);
  });

  if (filtered.length === 0) {
    stockList.innerHTML = renderEmptyState();
    return;
  }

  stockList.innerHTML = filtered.map(item => {
    const lowStock = isStockBelowMinimum(item);
    const expired = isStockExpired(item.fecha_vencimiento);
    const expiringSoon = !expired && isStockExpiringSoon(item.fecha_vencimiento, 30);

    const alerts = [];
    if (lowStock) alerts.push('<span class="stock-flag stock-flag-low">Stock bajo</span>');
    if (expired) {
      alerts.push('<span class="stock-flag stock-flag-expired">Vencido</span>');
    } else if (expiringSoon) {
      alerts.push('<span class="stock-flag stock-flag-soon">Próximo a vencer</span>');
    }

    const alertsBlock = alerts.length ? `<div class="stock-alerts">${alerts.join('')}</div>` : '';

    return `
      <article class="stock-card">
        <div class="row">
          <div>
            <div class="stock-title">${item.nombre}</div>
            <div class="stock-meta">Lote: ${item.lote || '-'}</div>
          </div>
          <div class="stock-actions">
            <button type="button" class="btn secondary edit-stock-btn" data-id="${item.id}">Editar</button>
            <button type="button" class="btn danger delete-stock-btn" data-id="${item.id}">Eliminar</button>
          </div>
        </div>
        <div class="row stock-row">
          <span class="stock-meta">Cantidad: <strong>${item.stock_actual} ${item.unidad_base}</strong></span>
          <span class="stock-meta">Costo unitario: <strong>$${Number(item.costo_unitario ?? 0).toFixed(2)}</strong></span>
          <span class="stock-meta">Proveedor: ${item.proveedor || '-'}</span>
          <span class="stock-meta">Vence: ${item.fecha_vencimiento || '-'}</span>
        </div>
        ${alertsBlock}
      </article>
    `;
  }).join('');

  const deleteButtons = stockList.querySelectorAll('.delete-stock-btn');
  const editButtons = stockList.querySelectorAll('.edit-stock-btn');

editButtons.forEach(button => {
  button.addEventListener('click', () => {
    const id = button.dataset.id;
    handleEditStock(id);
  });
});

  deleteButtons.forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.id;
      handleDeleteStock(id);
    });
  });
}

/** Renderiza lista de formulas con acciones de editar y eliminar */
function renderFormulaList(term = '') {
  if (!formulaList) return;
  formulaList.innerHTML = '';
  const filtered = state.formulas
    .filter((item) => matchesFormulaSearch(item, term))
    .sort((a, b) => b.createdAt - a.createdAt);

  if (!filtered.length) {
    formulaList.innerHTML = renderEmptyState();
    return;
  }

  filtered.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'formula-card';

    const ingList = (item.ingredientes || [])
      .map((ing) => {
        const nota = ing.observaciones ? ` · ${ing.observaciones}` : '';
        return `<li>${ing.nombre} — <strong>${ing.cantidad}</strong> ${ing.unidad}${nota}</li>`;
      })
      .join('');

    card.innerHTML = `
      <div class="row formula-card-head">
        <div class="title-line">
          <span class="formula-title">${item.nombre}</span>
          <span class="badge prep-chip">${item.forma}</span>
        </div>
        <span class="formula-meta">Presentacion: ${item.presentacion}</span>
      </div>
      <div>
        <p class="formula-meta">Ingredientes:</p>
        <ul class="formula-ingredients">${ingList}</ul>
      </div>
      <div class="row formula-card-footer">
        <div class="formula-meta">Costo estimado: <strong>$${Number(item.costoEstimado ?? 0).toFixed(2)}</strong></div>
        <div class="formula-meta">ID: ${item.id}</div>
        <div class="actions">
          <button class="btn secondary" data-action="edit">Editar</button>
          <button class="btn danger" data-action="delete">Eliminar</button>
        </div>
      </div>
    `;

    card.querySelector('[data-action="edit"]').addEventListener('click', () => startEditFormula(item.id));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteFormula(item.id));

    formulaList.appendChild(card);
  });
}

// ---- Manejadores de eventos ----

/** Captura el envio del formulario y guarda un nuevo preparado en memoria */
async function handleSubmit(event) {
  event.preventDefault();
  const formData = new FormData(form);

  const pdfFile = formData.get('pdf');
  const hasPdf = pdfFile && Number(pdfFile.size) > 0;
  const costo = Number(formData.get('costo'));
  const recargo = Number(formData.get('recargo'));
  const precioFinal = calcPrecioFinal(costo, recargo);

  if (precioFinal === null) {
    alert('Costo y recargo deben ser numeros no negativos.');
    return;
  }

  const editingId = state.editingId;
  const existingItem = editingId
    ? state.items.find((item) => normalizeId(item.id) === normalizeId(editingId))
    : null;

  if (editingId && !existingItem) {
    alert('No se encontro el preparado a editar. Recarga la lista e intenta nuevamente.');
    state.editingId = null;
    return;
  }

  const currentStatus = existingItem?.status || STATUS_FLOW[0];
  const currentStockApplied = Boolean(existingItem?.stockAplicado);
  const currentReceta = buildRecetaData({
    nombre: existingItem?.pdf?.name,
    path: existingItem?.pdf?.path,
    url: existingItem?.pdf?.url
  });

  const newItem = {
    id: genId(),
    cliente: formData.get('cliente').trim(),
    formula: formData.get('formula').trim(),
    cantidad: Number(formData.get('cantidad')),
    formaFarmaceutica: formData.get('formaFarmaceutica'),
    unidadMedida: formData.get('unidadMedida'),
    fechaCarga: formData.get('fechaCarga'),
    diaEntrega: formData.get('diaEntrega'),
    observaciones: (formData.get('observaciones') || '').trim(),
    status: currentStatus,
    stockAplicado: currentStockApplied,
    pdf: currentReceta,
    costo,
    recargo,
    precioFinal: Number(precioFinal.toFixed(2)),
    createdAt: Date.now()
  };

  let uploadedReceta = null;
  let shouldDeletePreviousReceta = false;
  const previousRecetaPath = currentReceta?.path || '';

  if (editingId && hasPdf) {
    const uploadResult = await uploadRecetaToStorage(editingId, pdfFile);
    if (!uploadResult.ok) {
      console.error('Error subiendo receta al bucket:', uploadResult.error);
      alert('No se pudo subir la receta al almacenamiento.');
      return;
    }

    uploadedReceta = uploadResult.data;
    newItem.pdf = uploadedReceta;
    shouldDeletePreviousReceta = Boolean(previousRecetaPath) && previousRecetaPath !== uploadedReceta.path;
  }

  const requiereRecalculoStock = Boolean(existingItem?.stockAplicado)
    && hasPreparedStockInputsChanged(existingItem, newItem);
  const mantieneImpactoStock = STOCK_IMPACT_STATUSES.has(currentStatus);
  const preparedForNewStock = existingItem
    ? { ...existingItem, ...newItem, id: existingItem.id }
    : null;
  let reversionEntries = [];
  let aplicacionEntries = [];

  if (requiereRecalculoStock && existingItem) {
    const reversion = await revertStockForPreparado(existingItem, {
      motivo: 'Reversion por edicion de formula/cantidad/unidad'
    });

    if (!reversion.ok) {
      if (uploadedReceta?.path) {
        await removeRecetaFromStorage(uploadedReceta.path);
      }
      alert(reversion.error || 'No se pudo revertir stock anterior antes de editar.');
      return;
    }
    reversionEntries = reversion.entries || [];

    if (mantieneImpactoStock) {
      const aplicacion = await applyStockForPreparado(preparedForNewStock, {
        motivo: 'Reaplicacion de stock por edicion de preparado'
      });

      if (!aplicacion.ok) {
        if (reversionEntries.length) {
          await processStockEntries({
            preparado: existingItem,
            entries: reversionEntries,
            tipoMovimiento: MOVIMIENTO_STOCK_CONSUMO,
            stockDeltaSign: -1,
            motivo: 'Rollback por fallo al reaplicar stock en edicion',
            source: 'rollback'
          });
        } else {
          await applyStockForPreparado(existingItem, {
            motivo: 'Rollback por fallo al reaplicar stock en edicion'
          });
        }
        if (uploadedReceta?.path) {
          await removeRecetaFromStorage(uploadedReceta.path);
        }
        alert(aplicacion.error || 'No se pudo reaplicar stock con los nuevos datos del preparado.');
        return;
      }

      aplicacionEntries = aplicacion.entries || [];
      newItem.stockAplicado = true;
    } else {
      newItem.stockAplicado = false;
    }
  }

  let error;
  let savedRow = null;
  let shouldRollbackInsertedRow = false;

  if (editingId) {
    const updatePayload = {
      cliente: newItem.cliente,
      formula: newItem.formula,
      cantidad: newItem.cantidad,
      forma_farmaceutica: newItem.formaFarmaceutica,
      unidad: newItem.unidadMedida,
      fecha_carga: newItem.fechaCarga || null,
      dia_entrega: newItem.diaEntrega || null,
      observaciones: newItem.observaciones,
      costo: newItem.costo,
      porcentaje_recargo: newItem.recargo,
      precio_final: newItem.precioFinal,
      stock_aplicado: newItem.stockAplicado
    };

    if (uploadedReceta) {
      updatePayload.archivo_receta_nombre = uploadedReceta.name;
      updatePayload.archivo_receta_path = uploadedReceta.path;
      updatePayload.archivo_receta_url = uploadedReceta.url;
    }

    const result = await supabaseClient
      .from('preparados')
      .update(updatePayload)
      .eq('id', editingId)
      .select()
      .single();

    error = result.error;
    savedRow = result.data;
  } else {
    const result = await supabaseClient
      .from('preparados')
      .insert([
        {
          cliente: newItem.cliente,
          formula: newItem.formula,
          cantidad: newItem.cantidad,
          forma_farmaceutica: newItem.formaFarmaceutica,
          unidad: newItem.unidadMedida,
          fecha_carga: newItem.fechaCarga || null,
          dia_entrega: newItem.diaEntrega || null,
          observaciones: newItem.observaciones,
          estado: newItem.status,
          costo: newItem.costo,
          porcentaje_recargo: newItem.recargo,
          precio_final: newItem.precioFinal,
          archivo_receta_nombre: null,
          archivo_receta_path: null,
          archivo_receta_url: null,
          stock_aplicado: false
        }
      ])
      .select()
      .single();

    error = result.error;
    savedRow = result.data;

    if (!error && hasPdf) {
      const savedPreparadoId = savedRow?.id;
      if (!savedPreparadoId) {
        error = new Error('No se pudo obtener el ID del preparado para subir la receta.');
        shouldRollbackInsertedRow = true;
      } else {
        const uploadResult = await uploadRecetaToStorage(savedPreparadoId, pdfFile);

        if (!uploadResult.ok) {
          console.error('Error subiendo receta al bucket:', uploadResult.error);
          error = uploadResult.error || new Error('No se pudo subir la receta.');
          shouldRollbackInsertedRow = true;
        } else {
          uploadedReceta = uploadResult.data;
          newItem.pdf = uploadedReceta;

          const recetaUpdateResult = await supabaseClient
            .from('preparados')
            .update({
              archivo_receta_nombre: uploadedReceta.name,
              archivo_receta_path: uploadedReceta.path,
              archivo_receta_url: uploadedReceta.url
            })
            .eq('id', savedPreparadoId)
            .select()
            .single();

          if (recetaUpdateResult.error) {
            console.error('Error guardando metadata de receta en preparado:', recetaUpdateResult.error);
            error = recetaUpdateResult.error;
            shouldRollbackInsertedRow = true;
            await removeRecetaFromStorage(uploadedReceta.path);
          } else {
            savedRow = recetaUpdateResult.data;
          }
        }
      }
    }
  }

  if (error) {
    console.error('Error guardando en Supabase:', error);

    if (uploadedReceta?.path && editingId) {
      await removeRecetaFromStorage(uploadedReceta.path);
    }

    if (!editingId && shouldRollbackInsertedRow && savedRow?.id) {
      const rollbackDelete = await supabaseClient
        .from('preparados')
        .delete()
        .eq('id', savedRow.id);

      if (rollbackDelete.error) {
        console.error('No se pudo limpiar preparado creado tras fallo de receta:', rollbackDelete.error);
      }
    }

    if (requiereRecalculoStock && existingItem) {
      if (mantieneImpactoStock && preparedForNewStock) {
        if (aplicacionEntries.length) {
          await processStockEntries({
            preparado: preparedForNewStock,
            entries: aplicacionEntries,
            tipoMovimiento: MOVIMIENTO_STOCK_REVERSION,
            stockDeltaSign: 1,
            motivo: 'Rollback por fallo guardando edicion',
            source: 'rollback'
          });
        } else {
          await revertStockForPreparado(preparedForNewStock, {
            motivo: 'Rollback por fallo guardando edicion'
          });
        }
      }

      if (reversionEntries.length) {
        await processStockEntries({
          preparado: existingItem,
          entries: reversionEntries,
          tipoMovimiento: MOVIMIENTO_STOCK_CONSUMO,
          stockDeltaSign: -1,
          motivo: 'Rollback restaurando stock original por fallo en guardado',
          source: 'rollback'
        });
      } else {
        await applyStockForPreparado(existingItem, {
          motivo: 'Rollback restaurando stock original por fallo en guardado'
        });
      }
    }

    alert('No se pudo guardar el preparado en Supabase.');
    return;
  }

  if (editingId && shouldDeletePreviousReceta) {
    const deletePreviousReceta = await removeRecetaFromStorage(previousRecetaPath);
    if (!deletePreviousReceta.ok) {
      console.error('No se pudo eliminar la receta previa del storage:', deletePreviousReceta.error);
      alert('El preparado se actualizo, pero no se pudo eliminar la receta anterior del storage.');
    }
  }

  const savedReceta = buildRecetaData({
    nombre: savedRow?.archivo_receta_nombre,
    path: savedRow?.archivo_receta_path,
    url: savedRow?.archivo_receta_url
  }) || newItem.pdf || null;

  if (editingId) {
    state.items = state.items.map((item) => {
      if (normalizeId(item.id) !== normalizeId(editingId)) return item;
      return {
        ...item,
        ...newItem,
        pdf: savedReceta,
        id: editingId,
        status: savedRow?.estado || newItem.status,
        stockAplicado: Boolean(savedRow?.stock_aplicado ?? newItem.stockAplicado),
        createdAt: savedRow?.created_at ? new Date(savedRow.created_at).getTime() : item.createdAt
      };
    });
  } else {
    state.items.push({
      ...newItem,
      pdf: savedReceta,
      id: savedRow?.id || newItem.id,
      status: savedRow?.estado || newItem.status,
      stockAplicado: Boolean(savedRow?.stock_aplicado ?? false),
      createdAt: savedRow?.created_at
        ? new Date(savedRow.created_at).getTime()
        : newItem.createdAt
    });
  }

  state.editingId = null;
  renderList(searchInput?.value || '');
  form.reset();
  autofillCostoDesdeFormula('');
  alert(editingId ? 'Preparado actualizado correctamente.' : 'Preparado guardado correctamente.');
}

/** Escucha el input de busqueda para filtrar al vuelo */
function handleSearch(event) {
  renderList(event.target.value);
}

/** Recalcula y actualiza el campo de precio final cuando cambia costo o recargo */
function updatePrecioFinalUI() {
  if (!costoInput || !recargoInput || !precioFinalInput) return;
  const costo = Number(costoInput.value);
  const recargo = Number(recargoInput.value);
  const calculado = calcPrecioFinal(costo, recargo);
  if (calculado === null) {
    precioFinalInput.value = '';
    return;
  }
  precioFinalInput.value = calculado.toFixed(2);
}

/** Recolecta ingredientes desde el formulario con validacion basica */
function collectIngredients() {
  const rows = Array.from(ingredientsContainer.querySelectorAll('.ingredient-row'));
  const materiaMap = new Map(state.stockItems.map((m) => [String(m.id), m]));

  const ingredients = rows.map((row) => {
    const materiaId = row.querySelector('select[name="ingMateriaId"]')?.value?.trim() || '';
    const cantidad = Number(row.querySelector('input[name="ingCantidad"]').value);
    const unidad = row.querySelector('select[name="ingUnidad"]').value;
    const observaciones = row.querySelector('input[name="ingObs"]')?.value?.trim() || '';
    const materia = materiaMap.get(String(materiaId));
    return {
      materia_prima_id: materiaId || null,
      nombre: materia?.nombre || '',
      cantidad,
      unidad,
      observaciones,
      costo_unitario: Number(materia?.costo_unitario) || 0
    };
  });

  const invalid = ingredients.find(
    (ing) => !ing.materia_prima_id || isNaN(ing.cantidad) || ing.cantidad <= 0 || !['Gramos', 'Mililitros', 'Unidades'].includes(ing.unidad)
  );
  if (invalid) {
    alert('Selecciona una materia prima y cantidad valida para cada componente.');
    return null;
  }
  return ingredients;
}

/** Maneja alta/edicion de formula */
async function handleFormulaSubmit(event) {
  event.preventDefault();
  if (!formulaForm || !ingredientsContainer) return;

  const formData = new FormData(formulaForm);
  const ingredientes = collectIngredients();
  if (!ingredientes || !ingredientes.length) {
    alert('Agrega al menos un ingrediente.');
    return;
  }

  const payload = {
    nombre: String(formData.get('formulaNombre') || '').trim(),
    forma_farmaceutica: String(formData.get('formulaForma') || '').trim(),
    presentacion_estandar: String(formData.get('formulaPresentacion') || '').trim()
  };

  if (!payload.nombre || !payload.forma_farmaceutica || !payload.presentacion_estandar) {
    alert('Completa nombre, forma farmaceutica y presentacion estandar.');
    return;
  }

  const isEditing = editingFormulaId !== null && editingFormulaId !== undefined;
  let formulaId = editingFormulaId;

  if (isEditing) {
    const { data, error } = await supabaseClient
      .from('formulas')
      .update(payload)
      .eq('id', formulaId)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando formula:', error);
      alert('No se pudo actualizar la formula.');
      return;
    }

    formulaId = data?.id ?? formulaId;

    const { error: deleteError } = await supabaseClient
      .from('formula_componentes')
      .delete()
      .eq('formula_id', formulaId);

    if (deleteError) {
      console.error('Error limpiando componentes:', deleteError);
      alert('No se pudo actualizar los componentes de la formula.');
      return;
    }
  } else {
    const { data, error } = await supabaseClient
      .from('formulas')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('Error creando fórmula completo:', error);
      alert((error && (error.message || error.details || error.hint || JSON.stringify(error))) || 'Error desconocido');
      return;
    }

    formulaId = data?.id;
  }

  if (!formulaId) {
    alert('No se pudo obtener el ID de la formula.');
    return;
  }

  if (ingredientes.length) {
    const componentesPayload = ingredientes.map((ing) => ({
      formula_id: formulaId,
      materia_prima_id: ing.materia_prima_id,
      cantidad: ing.cantidad,
      unidad: ing.unidad,
      observaciones: ing.observaciones || null
    }));

    const { error: insertComponentesError } = await supabaseClient
      .from('formula_componentes')
      .insert(componentesPayload);

    if (insertComponentesError) {
      console.error('Error guardando componentes:', insertComponentesError);
      alert('La formula se guardo pero hubo un problema con sus componentes.');
      await loadFormulasDesdeSupabase();
      return;
    }
  }

  await loadFormulasDesdeSupabase();
  resetFormulaForm();
  renderFormulaList(formulaSearch?.value || '');
  refreshFormulaOptions();
  alert('Formula guardada correctamente.');
}

/** Busca en formulas */
function handleFormulaSearch(event) {
  renderFormulaList(event.target.value);
}

/** Inicia edicion rellenando el formulario */
function startEditFormula(id) {
  if (!formulaForm || !ingredientsContainer) return;
  const item = findFormulaById(id);
  if (!item) return;
  editingFormulaId = item.id;

  const nombreInput = formulaForm.querySelector('input[name="formulaNombre"]');
  const formaSelect = formulaForm.querySelector('select[name="formulaForma"]');
  const presentacionInput = formulaForm.querySelector('input[name="formulaPresentacion"]');

  if (nombreInput) nombreInput.value = item.nombre || '';
  if (formaSelect) formaSelect.value = item.forma || '';
  if (presentacionInput) presentacionInput.value = item.presentacion || '';

  ingredientsContainer.innerHTML = '';
  const ingredientes = Array.isArray(item.ingredientes) ? item.ingredientes : [];
  if (ingredientes.length) {
    ingredientes.forEach((ing) => ingredientsContainer.appendChild(createIngredientRow(ing)));
  } else {
    ingredientsContainer.appendChild(createIngredientRow());
  }

  if (formulaSubmitBtn) formulaSubmitBtn.textContent = 'Actualizar formula';
  updateFormulaCostUI();
  formulaForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Elimina una formula por id */
async function deleteFormula(id) {
  const confirmar = confirm('¿Eliminar esta formula y sus componentes?');
  if (!confirmar) return;

  const { error: compError } = await supabaseClient
    .from('formula_componentes')
    .delete()
    .eq('formula_id', id);

  if (compError) {
    console.error('Error eliminando componentes:', compError);
    alert('No se pudo eliminar los componentes de la formula.');
    return;
  }

  const { error } = await supabaseClient
    .from('formulas')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error eliminando formula:', error);
    alert('No se pudo eliminar la formula.');
    return;
  }

  state.formulas = state.formulas.filter((f) => normalizeId(f.id) !== normalizeId(id));
  if (normalizeId(editingFormulaId) === normalizeId(id)) resetFormulaForm();
  renderFormulaList(formulaSearch?.value || '');
}

/** Limpia el formulario de formulas y deja una fila base de ingrediente */
function resetFormulaForm() {
  if (!formulaForm || !ingredientsContainer) return;
  editingFormulaId = null;
  formulaForm.reset();
  ingredientsContainer.innerHTML = '';
  ingredientsContainer.appendChild(createIngredientRow());
  if (formulaSubmitBtn) formulaSubmitBtn.textContent = 'Guardar formula';
  updateFormulaCostUI();
  refreshFormulaOptions();
}

/** Agrega una fila de ingrediente vacia */
function handleAddIngredient() {
  if (!ingredientsContainer) return;
  ingredientsContainer.appendChild(createIngredientRow());
  updateFormulaCostUI();
}

/** Guarda un nuevo item de stock en memoria */
async function handleStockSubmit(event) {
  event.preventDefault();

  const formData = new FormData(stockForm);

  const stockMinimo = parseFloat(formData.get('stockMinimo'));
  const costoUnitario = parseFloat(formData.get('costoUnitario'));

  const nuevaMateria = {
    nombre: formData.get('materiaPrima')?.trim() || '',
    tipo: null,
    unidad_base: formData.get('stockUnidad') || '',
    stock_actual: parseFloat(formData.get('stockCantidad')) || 0,
    stock_minimo: isNaN(stockMinimo) ? 0 : stockMinimo,
    costo_unitario: isNaN(costoUnitario) ? 0 : costoUnitario,
    lote: formData.get('lote')?.trim() || '',
    fecha_vencimiento: formData.get('fechaVenc') || null,
    proveedor: formData.get('proveedor')?.trim() || ''
  };

  const { error } = await supabaseClient
    .from('materias_primas')
    .insert([nuevaMateria]);

  if (error) {
    console.error('Error al guardar stock:', error);
    alert('Error al guardar stock');
    return;
  }

  stockForm.reset();
  await renderStockDesdeSupabase();
  await loadFormulasDesdeSupabase();
}

async function handleStockEditSubmit(event) {
  event.preventDefault();
  if (!stockEditForm) return;

  const formData = new FormData(stockEditForm);
  const id = formData.get('stockId');
  const payload = {
    stock_actual: parseFloat(formData.get('stock_actual')) || 0,
    stock_minimo: parseFloat(formData.get('stock_minimo')) || 0,
    costo_unitario: formData.get('costo_unitario') === '' ? null : parseFloat(formData.get('costo_unitario')),
    lote: (formData.get('lote') || '').trim(),
    proveedor: (formData.get('proveedor') || '').trim(),
    fecha_vencimiento: formData.get('fecha_vencimiento') || null
  };

  const { error } = await supabaseClient
    .from('materias_primas')
    .update(payload)
    .eq('id', id);

  if (error) {
    console.error('Error al actualizar:', error);
    alert('No se pudo actualizar el stock.');
    return;
  }

  closeStockEditModal();
  await renderStockDesdeSupabase();
  await loadFormulasDesdeSupabase();
  alert('Stock actualizado.');
}

async function handleDeleteStock(id) {
  const confirmar = confirm("¿Eliminar esta materia prima?");
  if (!confirmar) return;

  const { error } = await supabaseClient
    .from('materias_primas')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error al eliminar:', error);
    alert('Error al eliminar');
    return;
  }

  await renderStockDesdeSupabase();
  await loadFormulasDesdeSupabase();
}


/** Filtra stock por cualquier campo */
function handleStockSearch(event) {
  renderStockList(event.target.value);
}

// ---- Opciones de formulas para el datalist ----
function refreshFormulaOptions() {
  const options = state.formulas
    .map((f) => `<option value="${f.nombre}">`)
    .join('');
  const datalist = document.getElementById('formulaOptions');
  if (datalist) datalist.innerHTML = options;
}

// ---- Importacion CSV / Excel ----

/** Decide si usar coma o punto y coma como separador y divide respetando comillas simples */
function splitRow(line, delimiter) {
  const result = [];
  let current = '';
  let insideQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }
    if (char === delimiter && !insideQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/** Parsea CSV simple a objetos normalizados */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const firstLine = lines[0];
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitRow(lines[i], delimiter);
    rows.push(cols);
  }
  return rows;
}

/** Parsea Excel usando SheetJS */
function parseExcel(arrayBuffer) {
  if (!window.XLSX) throw new Error('Libreria XLSX no cargada');
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  json.shift(); // remove header
  return json;
}

/** Valida y transforma filas en formulas agrupadas (sin equivalencias) */
function processImportedRows(rawRows) {
  const errors = [];
  const allowedUnits = ['gr', 'ml', 'unidades', 'gramos', 'mililitros', 'unidades'];
  const allowedForms = ['polvo', 'capsulas', 'crema', 'serum'];

  const grouped = new Map();

  rawRows.forEach((cols, idx) => {
    const rowNum = idx + 2; // header offset
    const [nombre, ingNombre, cantidadStr, unidadRaw, formaRaw] = cols.map((c) => (typeof c === 'string' ? c.trim() : c));

    if (!nombre || !ingNombre || cantidadStr === undefined || !unidadRaw || !formaRaw) {
      errors.push(`Fila ${rowNum}: faltan campos obligatorios.`);
      return;
    }

    const cantidad = Number(cantidadStr);
    const unidad = unidadRaw.toString().toLowerCase();
    const forma = formaRaw.toString().toLowerCase();

    if (isNaN(cantidad) || cantidad <= 0) errors.push(`Fila ${rowNum}: cantidad invalida.`);
    if (!allowedUnits.includes(unidad)) errors.push(`Fila ${rowNum}: unidad invalida (${unidad}).`);
    if (!allowedForms.includes(forma)) errors.push(`Fila ${rowNum}: forma invalida (${forma}).`);

    const normalizedUnidad = unidad.startsWith('gr') ? 'Gramos' : unidad.startsWith('ml') ? 'Mililitros' : 'Unidades';
    const normalizedForma = forma.charAt(0).toUpperCase() + forma.slice(1);

    const base = grouped.get(nombre) || {
      id: null,
      nombre,
      forma: normalizedForma,
      presentacion: 'Importada - definir',
      ingredientes: [],
      createdAt: Date.now()
    };

    base.ingredientes.push({
      nombre: ingNombre,
      cantidad,
      unidad: normalizedUnidad
    });

    grouped.set(nombre, base);
  });

  if (errors.length) {
    alert(`Errores encontrados:\\n${errors.join('\\n')}`);
    return [];
  }

  return Array.from(grouped.values());
}

/** Inserta o actualiza formulas importadas directamente en Supabase */
async function upsertImportedFormulas(formulas) {
  const materiaMap = await getMateriaMapFresh();
  const materiasList = Array.from(materiaMap.values());
  const missingMaterias = new Set();

  for (const formula of formulas) {
    const existing = state.formulas.find((f) => f.nombre.toLowerCase() === formula.nombre.toLowerCase());
    let formulaId = existing?.id || null;

    const payload = {
      nombre: formula.nombre,
      forma_farmaceutica: formula.forma,
      presentacion_estandar: formula.presentacion
    };

    if (formulaId) {
      const { data, error } = await supabaseClient
        .from('formulas')
        .update(payload)
        .eq('id', formulaId)
        .select()
        .single();

      if (error) {
        console.error('Error actualizando formula importada:', error);
        continue;
      }

      formulaId = data?.id || formulaId;

      await supabaseClient.from('formula_componentes').delete().eq('formula_id', formulaId);
    } else {
      const { data, error } = await supabaseClient
        .from('formulas')
        .insert([payload])
        .select()
        .single();

      if (error) {
        console.error('Error creando formula importada:', error);
        continue;
      }

      formulaId = data?.id;
    }

    const componentesPayload = [];
    formula.ingredientes.forEach((ing) => {
      const materia = materiasList.find(
        (m) => m.nombre.toLowerCase() === ing.nombre.toLowerCase()
      );
      if (materia) {
        componentesPayload.push({
          formula_id: formulaId,
          materia_prima_id: materia.id,
          cantidad: ing.cantidad,
          unidad: ing.unidad,
          observaciones: null
        });
      } else {
        missingMaterias.add(ing.nombre);
      }
    });

    if (componentesPayload.length) {
      const { error: compError } = await supabaseClient
        .from('formula_componentes')
        .insert(componentesPayload);

      if (compError) {
        console.error('Error guardando componentes importados:', compError);
      }
    }
  }

  await loadFormulasDesdeSupabase();

  if (missingMaterias.size) {
    alert(`Componentes omitidos por falta de materia prima en stock: ${Array.from(missingMaterias).join(', ')}`);
  }
}

/** Manejador del input de archivo */
function handleImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  const reader = new FileReader();

  reader.onerror = () => alert('No se pudo leer el archivo.');

  reader.onload = async (e) => {
    try {
      const result = e.target.result;
      let rows = [];
      if (ext === 'csv') {
        rows = parseCSV(result);
      } else if (ext === 'xls' || ext === 'xlsx') {
        rows = parseExcel(result);
      } else {
        alert('Formato no soportado. Usa CSV, XLS o XLSX.');
        return;
      }
      const formulas = processImportedRows(rows);
      if (formulas.length) {
        await upsertImportedFormulas(formulas);
        importSummary.textContent = `Importacion exitosa: ${formulas.length} preparado(s) -> ${formulas.map((f) => f.nombre).join(', ')}`;
      }
    } catch (err) {
      console.error(err);
      alert('Error al procesar el archivo. Verifica el formato.');
    } finally {
      importInput.value = '';
    }
  };

  if (ext === 'csv') {
    reader.readAsText(file);
  } else {
    reader.readAsArrayBuffer(file);
  }
}

// ---- Datos de ejemplo para probar la interfaz ----
// ---- Inicializacion ----
async function cargarPreparados() {
  const { data, error } = await supabaseClient
    .from('preparados')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error cargando preparados:', error);
    return;
  }

  state.items = data.map(item => ({
    id: item.id,
    cliente: item.cliente,
    formula: item.formula,
    cantidad: item.cantidad,
    formaFarmaceutica: item.forma_farmaceutica,
    unidadMedida: item.unidad,
    fechaCarga: item.fecha_carga,
    diaEntrega: item.dia_entrega,
    observaciones: item.observaciones,
    status: item.estado,
    stockAplicado: Boolean(item.stock_aplicado),
    costo: item.costo,
    recargo: item.porcentaje_recargo,
    precioFinal: item.precio_final,
    pdf: buildRecetaData({
      nombre: item.archivo_receta_nombre,
      path: item.archivo_receta_path,
      url: item.archivo_receta_url
    }),
    createdAt: item.created_at ? new Date(item.created_at).getTime() : Date.now()
  }));
}

/** Obtiene mapa fresco de materias primas desde Supabase, asegura costo_unitario actualizado */
async function getMateriaMapFresh() {
  const { data, error } = await supabaseClient
    .from('materias_primas')
    .select('id, nombre, unidad_base, costo_unitario, stock_actual, stock_minimo, lote, proveedor, fecha_vencimiento, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error cargando materias primas para costos:', error);
    return new Map(state.stockItems.map((m) => [String(m.id), m]));
  }

  state.stockItems = data || [];
  renderDashboardAlerts();
  refreshIngredientRowsOptions();

  return new Map((data || []).map((m) => [String(m.id), m]));
}

async function loadFormulasDesdeSupabase() {
  const materiaMap = await getMateriaMapFresh();

  const { data: formulasData, error: formulasError } = await supabaseClient
    .from('formulas')
    .select('*')
    .order('created_at', { ascending: false });

  if (formulasError) {
    console.error('Error cargando formulas:', formulasError);
    return;
  }

  const formulaIds = (formulasData || []).map((f) => f.id);
  let componentesData = [];

  if (formulaIds.length) {
    const { data: compData, error: compError } = await supabaseClient
      .from('formula_componentes')
      .select('*')
      .in('formula_id', formulaIds);

    if (compError) {
      console.error('Error cargando componentes de formulas:', compError);
    } else {
      componentesData = compData;
    }
  }

  state.formulas = (formulasData || []).map((formula) => {
    const ingredientes = componentesData
      .filter((c) => String(c.formula_id) === String(formula.id))
      .map((c) => {
        const materia = materiaMap.get(String(c.materia_prima_id));
        return {
          id: c.id,
          formula_id: c.formula_id,
          materia_prima_id: c.materia_prima_id,
          nombre: materia?.nombre || `Materia #${c.materia_prima_id}`,
          cantidad: Number(c.cantidad) || 0,
          unidad: c.unidad || materia?.unidad_base || '',
          observaciones: c.observaciones || '',
          costo_unitario: materia ? Number(materia.costo_unitario) || 0 : null
        };
      });

    const costoEstimado = calcFormulaCost(ingredientes, materiaMap);

    return {
      id: formula.id,
      nombre: formula.nombre,
      forma: formula.forma_farmaceutica || formula.forma || '',
      presentacion: formula.presentacion_estandar || formula.presentacion || '',
      ingredientes,
      costoEstimado,
      createdAt: formula.created_at ? new Date(formula.created_at).getTime() : Date.now()
    };
  });

  renderFormulaList(formulaSearch?.value || '');
  refreshFormulaOptions();

  if (form && formulaInput && formulaInput.value?.trim()) {
    autofillCostoDesdeFormula(formulaInput.value);
  }
}
async function init() {
  await cargarPreparados();
  await renderStockDesdeSupabase();

  if (form && listContainer && searchInput) {
    renderList();
    form.addEventListener('submit', handleSubmit);
    searchInput.addEventListener('input', handleSearch);
    const handleFormulaInput = () => autofillCostoDesdeFormula(formulaInput?.value);
    const handleCantidadUnidadInput = () => updateCostoProporcionalUI();
    formulaInput?.addEventListener('input', handleFormulaInput);
    formulaInput?.addEventListener('change', handleFormulaInput);
    cantidadInput?.addEventListener('input', handleCantidadUnidadInput);
    cantidadInput?.addEventListener('change', handleCantidadUnidadInput);
    unidadMedidaInput?.addEventListener('change', handleCantidadUnidadInput);
    costoInput?.addEventListener('input', updatePrecioFinalUI);
    recargoInput?.addEventListener('input', updatePrecioFinalUI);
    autofillCostoDesdeFormula(formulaInput?.value);
  }

  if (stockForm && stockList && stockSearch) {
    stockForm.addEventListener('submit', handleStockSubmit);
    stockSearch.addEventListener('input', handleStockSearch);
    stockEditForm?.addEventListener('submit', handleStockEditSubmit);
    stockEditCloseBtn?.addEventListener('click', closeStockEditModal);
    stockEditCancelBtn?.addEventListener('click', closeStockEditModal);
    stockEditModal?.addEventListener('click', (event) => {
      if (event.target.classList.contains('modal-backdrop')) closeStockEditModal();
    });
  }

  if (formulaForm && formulaList && ingredientsContainer) {
    await loadFormulasDesdeSupabase();
    resetFormulaForm();
    formulaForm.addEventListener('submit', handleFormulaSubmit);
    addIngredientBtn?.addEventListener('click', handleAddIngredient);
    formulaSearch?.addEventListener('input', handleFormulaSearch);
    formulaResetBtn?.addEventListener('click', resetFormulaForm);
    importBtn?.addEventListener('click', () => importInput?.click());
    importInput?.addEventListener('change', handleImportFile);
  }

  refreshFormulaOptions();
}

init();


async function renderStockDesdeSupabase() {
  const { data, error } = await supabaseClient
    .from('materias_primas')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al cargar stock:', error);
    return;
  }

  state.stockItems = data || [];
  renderStockList(stockSearch?.value || '');
  renderDashboardAlerts();
  refreshIngredientRowsOptions();
}
async function handleEditStock(id) {
  const item = state.stockItems.find((s) => String(s.id) === String(id));
  if (!item) {
    alert('Item de stock no encontrado.');
    return;
  }
  openStockEditModal(item);
}
