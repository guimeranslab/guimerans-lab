// Punto de entrada JavaScript para Guimerans Lab. Modulo funcional de Preparados Pendientes.

// Definicion de estados permitidos y orden de avance
const STATUS_FLOW = ['Pendiente', 'Listo', 'Entregado'];

// Estado temporal en memoria (se reemplazara por base de datos real luego)
const state = {
  items: [],       // Preparados pendientes
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
const importBtn = document.getElementById('importBtn');
const importInput = document.getElementById('importInput');
const importSummary = document.getElementById('importSummary');
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

/** Heuristica simple para marcar stock bajo segun unidad */
function isLowStock(item) {
  const thresholds = { Unidades: 10, Gramos: 200, Mililitros: 200 };
  const limite = thresholds[item.unidadMedida] ?? 10;
  return Number(item.cantidad) <= limite;
}

/** Crea un nodo de fila de ingrediente con datos opcionales */
function createIngredientRow(data = {}) {
  const row = document.createElement('div');
  row.className = 'ingredient-row';
  row.innerHTML = `
    <input type="text" name="ingNombre" placeholder="Ingrediente" value="${data.nombre || ''}" required>
    <input type="number" name="ingCantidad" min="0.01" step="0.01" placeholder="Cantidad" value="${data.cantidad ?? ''}" required>
    <select name="ingUnidad" required>
      <option value="Gramos" ${data.unidad === 'Gramos' ? 'selected' : ''}>Gramos</option>
      <option value="Mililitros" ${data.unidad === 'Mililitros' ? 'selected' : ''}>Mililitros</option>
      <option value="Unidades" ${data.unidad === 'Unidades' ? 'selected' : ''}>Unidades</option>
    </select>
    <button type="button" class="remove-ingredient">Quitar</button>
  `;
  const removeBtn = row.querySelector('.remove-ingredient');
  removeBtn.addEventListener('click', () => row.remove());
  return row;
}

/** Avanza el estado de un preparado respetando el flujo definido */
function advanceStatus(id) {
  const item = state.items.find((p) => p.id === id);
  if (!item) return;
  const currentIndex = STATUS_FLOW.indexOf(item.status);
  if (currentIndex < STATUS_FLOW.length - 1) {
    item.status = STATUS_FLOW[currentIndex + 1];
  }
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
  const ingText = item.ingredientes
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
        <div class="meta">PDF: ${item.pdf ? `<a class="pdf-link" href="${item.pdf.url}" target="_blank" rel="noopener">${item.pdf.name}</a>` : 'No adjuntado'}</div>
        <div class="actions">
  <button class="btn ghost" data-action="advance" ${item.status === 'Entregado' ? 'disabled' : ''}>${nextLabel}</button>
  <button class="btn ghost" data-action="delete">Eliminar</button>
</div>s
      </div>
    `;

    const advanceBtn = card.querySelector('[data-action="advance"]');
    if (advanceBtn) {
      advanceBtn.addEventListener('click', () => advanceStatus(item.id));
    }
    const deleteBtn = card.querySelector('[data-action="delete"]');
if (deleteBtn) {
  deleteBtn.addEventListener('click', () => deletePreparado(item.id));
}

    listContainer.appendChild(card);
  });
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
function renderStockList(term = '') {
  stockList.innerHTML = '';
  const filtered = state.stockItems
    .filter((item) => matchesSearch({
      ...item,
      cantidad: item.cantidad,
      fechaCarga: item.fechaVenc,
      diaEntrega: item.fechaVenc,
      observaciones: item.proveedor
    }, term))
    .sort((a, b) => new Date(a.fechaVenc) - new Date(b.fechaVenc));

  if (!filtered.length) {
    stockList.innerHTML = '<div class="empty-state">No hay stock cargado.</div>';
    return;
  }

  filtered.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'stock-card';

    const low = isLowStock(item);
    const exp = isExpiringSoon(item.fechaVenc, 7);

    const alerts = [];
    if (low) alerts.push('<span class="pill alert-pill alert-low">Stock bajo</span>');
    if (exp) alerts.push('<span class="pill alert-pill alert-exp">Vence pronto</span>');

    card.innerHTML = `
      <div class="title-line">
        <span>${item.materiaPrima}</span>
        <span class="badge">${item.lote}</span>
      </div>
      <div class="row">
        <span class="stock-meta">Cantidad: <strong>${formatCantidad(item)}</strong></span>
        <span class="stock-meta">Vence: ${item.fechaVenc}</span>
        <span class="stock-meta">Proveedor: ${item.proveedor}</span>
      </div>
      <div class="alert-row">${alerts.join(' ') || '<span class="stock-meta">Sin alertas</span>'}</div>
    `;

    stockList.appendChild(card);
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

    const ingList = item.ingredientes
      .map((ing) => `<li>${ing.nombre} — <strong>${ing.cantidad}</strong> ${ing.unidad}</li>`)
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

  const { error } = await supabaseClient.from('preparados').insert([
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
  ]);

  if (error) {
    console.error('Error guardando en Supabase:', error);
    alert('No se pudo guardar el preparado en Supabase.');
    return;
  }

  state.items.push(newItem);
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
  const ingredients = rows.map((row) => {
    const nombre = row.querySelector('input[name="ingNombre"]').value.trim();
    const cantidad = Number(row.querySelector('input[name="ingCantidad"]').value);
    const unidad = row.querySelector('select[name="ingUnidad"]').value;
    return { nombre, cantidad, unidad };
  });

  const invalid = ingredients.find(
    (ing) => !ing.nombre || isNaN(ing.cantidad) || ing.cantidad <= 0 || !['Gramos', 'Mililitros', 'Unidades'].includes(ing.unidad)
  );
  if (invalid) {
    alert('Verifica ingredientes: nombre requerido, cantidad positiva y unidad valida.');
    return null;
  }
  return ingredients;
}

/** Maneja alta/edicion de formula */
function handleFormulaSubmit(event) {
  event.preventDefault();
  if (!ingredientsContainer) return;

  const formData = new FormData(formulaForm);
  const ingredientes = collectIngredients();
  if (!ingredientes || !ingredientes.length) {
    alert('Agrega al menos un ingrediente.');
    return;
  }

  const payload = {
    id: editingFormulaId || genId(),
    nombre: formData.get('formulaNombre').trim(),
    forma: formData.get('formulaForma'),
    presentacion: formData.get('formulaPresentacion').trim(),
    ingredientes,
    createdAt: editingFormulaId ? Date.now() : Date.now()
  };

  if (editingFormulaId) {
    const idx = state.formulas.findIndex((f) => f.id === editingFormulaId);
    if (idx >= 0) state.formulas[idx] = payload;
  } else {
    state.formulas.push(payload);
  }

  resetFormulaForm();
  renderFormulaList(formulaSearch.value);
  refreshFormulaOptions();
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
}

/** Elimina una formula por id */
function deleteFormula(id) {
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
  refreshFormulaOptions();
}

/** Agrega una fila de ingrediente vacia */
function handleAddIngredient() {
  ingredientsContainer.appendChild(createIngredientRow());
}

/** Guarda un nuevo item de stock en memoria */
function handleStockSubmit(event) {
  event.preventDefault();
  const formData = new FormData(stockForm);

  const newItem = {
    id: genId(),
    materiaPrima: formData.get('materiaPrima').trim(),
    cantidad: Number(formData.get('stockCantidad')),
    unidadMedida: formData.get('stockUnidad'),
    lote: formData.get('lote').trim(),
    fechaVenc: formData.get('fechaVenc'),
    proveedor: formData.get('proveedor').trim(),
    createdAt: Date.now()
  };

  state.stockItems.push(newItem);
  stockForm.reset();
  renderStockList(stockSearch.value);
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

/** Inserta o actualiza formulas importadas en el estado */
function upsertImportedFormulas(formulas) {
  formulas.forEach((formula) => {
    const existing = state.formulas.find((f) => f.nombre.toLowerCase() === formula.nombre.toLowerCase());
    if (existing) {
      formula.id = existing.id;
      Object.assign(existing, formula);
    } else {
      formula.id = genId();
      state.formulas.push(formula);
    }
  });
  renderFormulaList(formulaSearch?.value || '');
  refreshFormulaOptions();
}

/** Manejador del input de archivo */
function handleImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  const reader = new FileReader();

  reader.onerror = () => alert('No se pudo leer el archivo.');

  reader.onload = (e) => {
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
        upsertImportedFormulas(formulas);
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
async function init() {
  await cargarPreparados();
  if (form && listContainer && searchInput) {
    renderList();
    form.addEventListener('submit', handleSubmit);
    searchInput.addEventListener('input', handleSearch);
    costoInput?.addEventListener('input', updatePrecioFinalUI);
    recargoInput?.addEventListener('input', updatePrecioFinalUI);
    updatePrecioFinalUI();
  }

  if (stockForm && stockList && stockSearch) {
    renderStockList();
    stockForm.addEventListener('submit', handleStockSubmit);
    stockSearch.addEventListener('input', handleStockSearch);
  }

  if (formulaForm && formulaList && ingredientsContainer) {
    resetFormulaForm();
    renderFormulaList();
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
