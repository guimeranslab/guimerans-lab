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
const costoInput = form?.querySelector('input[name="costo"]');
const recargoInput = form?.querySelector('input[name="recargo"]');
const precioFinalInput = form?.querySelector('input[name="precioFinal"]');

let editingFormulaId = null;

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

function openStockEditModal(item) {
  if (!stockEditModal || !stockEditForm) return;
  stockEditModal.classList.remove('hidden');
  stockEditForm.stockId.value = item.id;
  stockEditForm.stock_actual.value = item.stock_actual ?? '';
  stockEditForm.stock_minimo.value = item.stock_minimo ?? '';
  stockEditForm.costo_unitario.value = item.costo_unitario ?? '';
  stockEditForm.lote.value = item.lote ?? '';
  stockEditForm.proveedor.value = item.proveedor ?? '';
  stockEditForm.fecha_vencimiento.value = item.fecha_vencimiento ? new Date(item.fecha_vencimiento).toISOString().slice(0, 10) : '';
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

/** Avanza el estado de un preparado respetando el flujo definido */
async function advanceStatus(id) {
  const item = state.items.find((p) => p.id === id);
  if (!item) return;

  const currentIndex = STATUS_FLOW.indexOf(item.status);
  if (currentIndex >= STATUS_FLOW.length - 1) return;

  const nextStatus = STATUS_FLOW[currentIndex + 1];

  const { error } = await supabaseClient
    .from('preparados')
    .update({ estado: nextStatus })
    .eq('id', id);

  if (error) {
    console.error('Error actualizando estado en Supabase:', error);
    alert('No se pudo actualizar el estado.');
    return;
  }

  item.status = nextStatus;
  renderList(searchInput.value);
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

/** Completa el campo costo segun el costo estimado de la formula elegida */
function autofillCostoDesdeFormula(nombre) {
  if (!costoInput) return;
  const target = nombre?.trim();
  if (!target) {
    costoInput.value = '';
    updatePrecioFinalUI();
    return;
  }

  const formula = findFormulaByName(target);
  if (!formula) return;

  const costo = Number(formula.costoEstimado);
  costoInput.value = isNaN(costo) ? '0' : costo.toFixed(2);
  updatePrecioFinalUI();
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

/** Renderiza la lista de preparados aplicando filtro de busqueda */
function renderList(term = '') {
  listContainer.innerHTML = '';
  const filtered = state.items
    .filter((item) => matchesSearch(item, term))
    .sort((a, b) => b.createdAt - a.createdAt);

  if (!filtered.length) {
    listContainer.innerHTML = '<div class="empty-state">No hay preparados pendientes.</div>';
    return;
  }

  filtered.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'prep-card';
    card.dataset.status = item.status;

    const nextIndex = STATUS_FLOW.indexOf(item.status) + 1;
    const nextLabel = STATUS_FLOW[nextIndex] ? `Avanzar a ${STATUS_FLOW[nextIndex]}` : 'Estado final';

    card.innerHTML = `
      <div class="title-line">
        <span class="pill status status-${item.status.toLowerCase()}">${item.status}</span>
        <span>${item.cliente}</span>
        <span class="badge">${item.formula}</span>
        <span class="badge">${item.formaFarmaceutica}</span>
      </div>
      <div class="row">
        <span class="meta">Cantidad: <strong>${formatCantidad(item)}</strong></span>
        <span class="meta">Carga: ${item.fechaCarga}</span>
        <span class="meta">Entrega: ${item.diaEntrega}</span>
      </div>
      <div class="row">
        <span class="meta">Costo: $${(item.costo ?? 0).toFixed ? item.costo.toFixed(2) : Number(item.costo).toFixed(2)}</span>
        <span class="meta">Recargo: ${(item.recargo ?? 0)}%</span>
        <span class="meta">Precio final: <strong>$${(item.precioFinal ?? 0).toFixed ? item.precioFinal.toFixed(2) : Number(item.precioFinal).toFixed(2)}</strong></span>
      </div>
      <p class="meta">Notas: ${item.observaciones || 'Sin observaciones'}</p>
      <div class="row">
  <div class="meta">
    PDF: ${item.pdf ? `<a class="pdf-link" href="${item.pdf.url}" target="_blank" rel="noopener">${item.pdf.name}</a>` : 'No adjuntado'}
  </div>

  <div class="actions">
    <button class="btn ghost" data-action="advance" ${item.status === 'Entregado' ? 'disabled' : ''}>${nextLabel}</button>
    <button class="btn ghost" data-action="edit">Editar</button>
    <button class="btn ghost" data-action="delete">Eliminar</button>
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

const deleteBtn = card.querySelector('[data-action="delete"]');
if (deleteBtn) {
  deleteBtn.addEventListener('click', () => deletePreparado(item.id));
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
  form.costo.value = item.costo ?? '';
  form.recargo.value = item.recargo ?? '';

  updatePrecioFinalUI();

  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
}async function deletePreparado(id) {
  const confirmar = confirm('¿Querés eliminar este preparado?');
  if (!confirmar) return;

  const { error } = await supabaseClient
    .from('preparados')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error eliminando en Supabase:', error);
    alert('No se pudo eliminar el preparado.');
    return;
  }

  state.items = state.items.filter(item => item.id !== id);
  renderList(searchInput.value);
  alert('Preparado eliminado correctamente.');
}

/** Renderiza la lista de stock aplicando filtro y marcando alertas */
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
    stockList.innerHTML = `<div class="placeholder">No hay stock cargado.</div>`;
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
            <button type="button" class="btn ghost edit-stock-btn" data-id="${item.id}">Editar</button>
            <button type="button" class="btn ghost delete-stock-btn" data-id="${item.id}">Eliminar</button>
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
    formulaList.innerHTML = '<div class="empty-state">No hay formulas cargadas.</div>';
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
      <div class="row">
        <div class="title-line">
          <span>${item.nombre}</span>
          <span class="badge">${item.forma}</span>
        </div>
        <span class="formula-meta">Presentacion: ${item.presentacion}</span>
      </div>
      <div>
        <p class="formula-meta">Ingredientes:</p>
        <ul class="formula-meta" style="padding-left:18px; margin: 4px 0 8px 0;">${ingList}</ul>
      </div>
      <div class="row">
        <div class="formula-meta">Costo estimado: <strong>$${Number(item.costoEstimado ?? 0).toFixed(2)}</strong></div>
        <div class="formula-meta">ID: ${item.id}</div>
        <div class="actions">
          <button class="btn ghost" data-action="edit">Editar</button>
          <button class="btn ghost" data-action="delete">Eliminar</button>
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
  const hasPdf = pdfFile && pdfFile.size > 0;
  const costo = Number(formData.get('costo'));
  const recargo = Number(formData.get('recargo'));
  const precioFinal = calcPrecioFinal(costo, recargo);

  if (precioFinal === null) {
    alert('Costo y recargo deben ser numeros no negativos.');
    return;
  }

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
    status: STATUS_FLOW[0],
    pdf: hasPdf ? { name: pdfFile.name, url: URL.createObjectURL(pdfFile) } : null,
    costo,
    recargo,
    precioFinal: Number(precioFinal.toFixed(2)),
    createdAt: Date.now()
  };

  let error;
let insertedRow = null;

if (state.editingId) {
  const result = await supabaseClient
    .from('preparados')
    .update({
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
      precio_final: newItem.precioFinal
    })
    .eq('id', state.editingId)
    .select()
    .single();

  error = result.error;
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
        precio_final: newItem.precioFinal
      }
    ])
    .select()
    .single();

  error = result.error;
  insertedRow = result.data;
} 


  if (error) {
    console.error('Error guardando en Supabase:', error);
    alert('No se pudo guardar el preparado en Supabase.');
    return;
  }

  if (state.editingId) {
  state.items = state.items.map(item =>
    item.id === state.editingId
      ? { ...item, ...newItem, id: state.editingId }
      : item
  );
} else {
  state.items.push({
    ...newItem,
    id: insertedRow?.id || newItem.id,
    createdAt: insertedRow?.created_at
      ? new Date(insertedRow.created_at).getTime()
      : newItem.createdAt
  });
}
  renderList();
  form.reset();
  updatePrecioFinalUI();
  alert('Preparado guardado correctamente.');
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
    const materiaId = row.querySelector('select[name="ingMateriaId"]').value;
    const cantidad = Number(row.querySelector('input[name="ingCantidad"]').value);
    const unidad = row.querySelector('select[name="ingUnidad"]').value;
    const observaciones = row.querySelector('input[name="ingObs"]')?.value?.trim() || '';
    const materia = materiaMap.get(String(materiaId));
    return {
      materia_prima_id: materiaId ? Number(materiaId) : null,
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
  if (!ingredientsContainer) return;

  const formData = new FormData(formulaForm);
  const ingredientes = collectIngredients();
  if (!ingredientes || !ingredientes.length) {
    alert('Agrega al menos un ingrediente.');
    return;
  }

  const payload = {
    nombre: formData.get('formulaNombre').trim(),
    forma_farmaceutica: formData.get('formulaForma'),
    presentacion_estandar: formData.get('formulaPresentacion').trim()
  };

  let formulaId = editingFormulaId;

  if (editingFormulaId) {
    const { data, error } = await supabaseClient
      .from('formulas')
      .update(payload)
      .eq('id', editingFormulaId)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando formula:', error);
      alert('No se pudo actualizar la formula.');
      return;
    }

    formulaId = data?.id || editingFormulaId;

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
      console.error('Error creando formula:', error);
      alert('No se pudo crear la formula.');
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
  renderFormulaList(formulaSearch.value);
  refreshFormulaOptions();
  alert('Formula guardada correctamente.');
}

/** Busca en formulas */
function handleFormulaSearch(event) {
  renderFormulaList(event.target.value);
}

/** Inicia edicion rellenando el formulario */
function startEditFormula(id) {
  const item = state.formulas.find((f) => f.id === id);
  if (!item) return;
  editingFormulaId = id;
  formulaForm.querySelector('input[name="formulaNombre"]').value = item.nombre;
  formulaForm.querySelector('select[name="formulaForma"]').value = item.forma;
  formulaForm.querySelector('input[name="formulaPresentacion"]').value = item.presentacion;

  ingredientsContainer.innerHTML = '';
  item.ingredientes.forEach((ing) => ingredientsContainer.appendChild(createIngredientRow(ing)));
  formulaSubmitBtn.textContent = 'Actualizar formula';
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

  state.formulas = state.formulas.filter((f) => f.id !== id);
  if (editingFormulaId === id) resetFormulaForm();
  renderFormulaList(formulaSearch.value);
}

/** Limpia el formulario de formulas y deja una fila base de ingrediente */
function resetFormulaForm() {
  editingFormulaId = null;
  formulaForm.reset();
  ingredientsContainer.innerHTML = '';
  ingredientsContainer.appendChild(createIngredientRow());
  formulaSubmitBtn.textContent = 'Guardar formula';
  updateFormulaCostUI();
  refreshFormulaOptions();
}

/** Agrega una fila de ingrediente vacia */
function handleAddIngredient() {
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
      forma: formula.forma,
      presentacion: formula.presentacion
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
    costo: item.costo,
    recargo: item.porcentaje_recargo,
    precioFinal: item.precio_final,
    createdAt: new Date(item.created_at).getTime()
  }));
}

/** Obtiene mapa fresco de materias primas desde Supabase, asegura costo_unitario actualizado */
async function getMateriaMapFresh() {
  const { data, error } = await supabaseClient
    .from('materias_primas')
    .select('id, nombre, unidad_base, costo_unitario');

  if (error) {
    console.error('Error cargando materias primas para costos:', error);
    return new Map(state.stockItems.map((m) => [String(m.id), m]));
  }

  state.stockItems = data || [];
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
      forma: formula.forma || formula.forma_farmaceutica || '',
      presentacion: formula.presentacion || formula.presentacion_estandar || '',
      ingredientes,
      costoEstimado,
      createdAt: formula.created_at ? new Date(formula.created_at).getTime() : Date.now()
    };
  });

  renderFormulaList(formulaSearch?.value || '');
  refreshFormulaOptions();

  if (form && formulaInput && (!costoInput?.value || costoInput.value === '0')) {
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
    formulaInput?.addEventListener('input', handleFormulaInput);
    formulaInput?.addEventListener('change', handleFormulaInput);
    costoInput?.addEventListener('input', updatePrecioFinalUI);
    recargoInput?.addEventListener('input', updatePrecioFinalUI);
    updatePrecioFinalUI();
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

