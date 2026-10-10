'use strict';

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------
const EMPRESAS = [
  'GRUPO TEBA',
  'CONSOCIOS',
  'IMAGEN',
  'BLANCO',
  'PILINA',
  'INELECTO ALTA/SKY VISION',
];

// ---------------------------------------------------------------------------
// Estado y almacenamiento
// ---------------------------------------------------------------------------
// state = {
//   cronos:  { [empresa]: { acumulado: ms, inicio: ms | null } },
//   control: [{ id, mes: 'AAAA-MM', empresa, ms, importe: number | null }]
// }
//
// Los datos se guardan en la nube (capacidad `db` del link publicado):
//   cronos/<slug-empresa>  y  control/<id>
// Si la página se abre como programa descargado, se guarda en el navegador y,
// además, en un archivo de datos de la computadora (ver "Archivo de datos").
const STORAGE_KEY = 'control-tiempo-v2';

function normalizar(data) {
  const s = {
    cronos: (data && data.cronos) || {},
    control: (data && Array.isArray(data.control)) ? data.control : [],
  };
  for (const e of EMPRESAS) {
    if (!s.cronos[e]) s.cronos[e] = { acumulado: 0, inicio: null };
  }
  return s;
}

function cargarLocal() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { /* sin datos */ }
  return normalizar(data);
}

function guardarLocal() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage bloqueado */ }
  guardarArchivo();
}

let state = cargarLocal();
let db = null; // namespace de la nube, cuando está disponible

const slug = (empresa) => empresa.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Las escrituras a la nube se hacen de a una, en orden.
let colaEscrituras = Promise.resolve();
function escribir(fn) {
  colaEscrituras = colaEscrituras.then(fn).catch((e) => {
    aviso('No se pudo guardar el último cambio. Revisá la conexión e intentá de nuevo.');
    console.error(e);
  });
  return colaEscrituras;
}

function guardarCronos(empresas) {
  guardarLocal();
  if (!db) return;
  for (const e of empresas) {
    const c = state.cronos[e];
    escribir(() => db.doc('cronos/' + slug(e)).set({ empresa: e, acumulado: c.acumulado, inicio: c.inicio }));
  }
}

function guardarFila(fila) {
  guardarLocal();
  if (db) escribir(() => db.doc('control/' + fila.id).set({ ...fila }));
}

function borrarFila(id) {
  state.control = state.control.filter((f) => f.id !== id);
  guardarLocal();
  if (db) escribir(() => db.doc('control/' + id).delete());
}

function marcarGuardado(nube) {
  const el = $('guardado');
  el.className = 'guardado ' + (nube ? 'nube' : 'local');
  el.textContent = nube
    ? '✓ Datos guardados en la nube'
    : '⚠ Datos guardados solo en este navegador. Usá el link publicado para no perderlos.';
}

async function conectarNube() {
  const use = window.claude && window.claude.use;
  const ns = use ? await window.claude.use('db').catch(() => null) : null;
  if (!ns) {
    iniciarModoArchivo();
    return;
  }
  db = ns;
  marcarGuardado(true);

  db.collection('cronos').onSnapshot((snap) => {
    for (const d of snap.docs) {
      const v = d.data();
      if (EMPRESAS.includes(v.empresa)) {
        state.cronos[v.empresa] = { acumulado: Number(v.acumulado) || 0, inicio: v.inicio || null };
      }
    }
    guardarLocal();
    render();
  }, errorNube);

  db.collection('control').onSnapshot((snap) => {
    state.control = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    guardarLocal();
    render();
  }, errorNube);
}

function errorNube(e) {
  console.error(e);
  aviso('Se perdió la conexión con la nube. Recargá la página.');
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const HORA = 3600000;
const MINUTO = 60000;

function reloj(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

const horasDec = (ms) => ms / HORA;
const fmtHoras = (ms) => horasDec(ms).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPesos = (n) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

function nombreMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  const txt = new Date(a, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

// Acepta "150000", "150.000", "150.000,50", "150000,50", "150000.50", "$ 150.000".
function parseImporte(txt) {
  let s = String(txt).replace(/[$\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let avisoTimer = null;
function aviso(txt) {
  const t = $('toast');
  t.textContent = txt;
  t.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { t.hidden = true; }, 4000);
}

// Abre un <dialog> y resuelve con true si se confirmó con el botón "ok".
function preguntar(dlg) {
  return new Promise((resolve) => {
    dlg.returnValue = '';
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    dlg.showModal();
  });
}

function confirmar(txt, boton = 'Eliminar') {
  $('confirm-txt').textContent = txt;
  $('confirm-ok').textContent = boton;
  return preguntar($('dlg-confirm'));
}

async function descargar(nombre, contenido, tipo) {
  const downloads = window.claude && window.claude.use
    ? await window.claude.use('downloads').catch(() => null)
    : null;
  if (downloads) {
    try { await downloads.save({ filename: nombre, data: contenido }); } catch (e) {
      if (e && e.code !== 'declined') aviso('No se pudo descargar el archivo.');
    }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------------------
// Cronómetros
// ---------------------------------------------------------------------------
function tiempoActual(empresa) {
  const c = state.cronos[empresa];
  return c.acumulado + (c.inicio ? Date.now() - c.inicio : 0);
}

// Detiene el cronómetro en memoria; devuelve true si estaba corriendo.
function detener(empresa) {
  const c = state.cronos[empresa];
  if (!c.inicio) return false;
  c.acumulado += Date.now() - c.inicio;
  c.inicio = null;
  return true;
}

function iniciar(empresa) {
  // Solo una empresa corriendo a la vez: las demás se detienen (su tiempo queda acumulado).
  const cambiadas = EMPRESAS.filter((e) => e !== empresa && detener(e));
  state.cronos[empresa].inicio = Date.now();
  guardarCronos([...cambiadas, empresa]);
  render();
}

function pausar(empresa) {
  if (detener(empresa)) guardarCronos([empresa]);
  render();
}

async function finalizar(empresa) {
  if (detener(empresa)) guardarCronos([empresa]);
  render();

  const ms = state.cronos[empresa].acumulado;
  if (ms < 1000) {
    aviso(`${empresa} no tiene tiempo acumulado para finalizar.`);
    return;
  }

  // Paso 1: mes
  $('mes-empresa').textContent = empresa;
  $('mes-tiempo').textContent = `${reloj(ms)} (${fmtHoras(ms)} h)`;
  $('in-mes').value = mesActual();
  if (!(await preguntar($('dlg-mes')))) return;
  const mes = $('in-mes').value;
  if (!mes) return;

  // Trasladar al cuadro de control (si ya hay una fila de ese mes y empresa, se suma).
  let fila = state.control.find((f) => f.mes === mes && f.empresa === empresa);
  if (fila) fila.ms += ms;
  else {
    fila = { id: nuevoId(), mes, empresa, ms, importe: null };
    state.control.push(fila);
  }
  state.cronos[empresa].acumulado = 0;
  guardarFila(fila);
  guardarCronos([empresa]);
  render();

  // Paso 2: importe de facturación
  await pedirImporte(fila);
}

async function pedirImporte(fila) {
  $('imp-detalle').textContent = `${fila.empresa} · ${nombreMes(fila.mes)} · ${fmtHoras(fila.ms)} h trabajadas`;
  $('in-importe').value = fila.importe != null
    ? fila.importe.toLocaleString('es-AR', { maximumFractionDigits: 2 })
    : '';
  $('imp-error').textContent = '';
  actualizarPreview(fila);
  $('in-importe').oninput = () => actualizarPreview(fila);
  if (!(await preguntar($('dlg-importe')))) return;
  const imp = parseImporte($('in-importe').value);
  fila.importe = imp === null ? null : imp;
  guardarFila(fila);
  render();
}

function actualizarPreview(fila) {
  const imp = parseImporte($('in-importe').value);
  $('imp-preview').textContent = imp > 0
    ? `Costo por hora: ${fmtPesos(imp / horasDec(fila.ms))} · por minuto: ${fmtPesos(imp / (fila.ms / MINUTO))}`
    : '';
}

// Validar el importe antes de cerrar el diálogo.
$('imp-ok').addEventListener('click', (ev) => {
  if (Number.isNaN(parseImporte($('in-importe').value))) {
    ev.preventDefault();
    $('imp-error').textContent = 'Importe inválido. Ejemplo: 150000,00';
  }
});

async function ajustar(empresa) {
  if (detener(empresa)) guardarCronos([empresa]);
  render();
  const min = Math.round(state.cronos[empresa].acumulado / MINUTO);
  $('aj-empresa').textContent = empresa;
  $('aj-h').value = Math.floor(min / 60);
  $('aj-m').value = min % 60;
  if (!(await preguntar($('dlg-ajuste')))) return;
  const h = Math.max(0, parseInt($('aj-h').value, 10) || 0);
  const m = Math.max(0, parseInt($('aj-m').value, 10) || 0);
  state.cronos[empresa].acumulado = (h * 60 + m) * MINUTO;
  guardarCronos([empresa]);
  render();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function renderEmpresas() {
  $('empresas').innerHTML = EMPRESAS.map((e, i) => {
    const c = state.cronos[e];
    const corriendo = !!c.inicio;
    return `
      <div class="empresa${corriendo ? ' running' : ''}">
        <div class="empresa-head">
          <span class="empresa-nombre">${escapeHtml(e)}</span>
          <span class="estado">${corriendo ? '● Trabajando' : (c.acumulado ? 'En pausa' : '')}</span>
        </div>
        <div class="acumulado" data-reloj="${i}">${reloj(tiempoActual(e))}</div>
        <div class="acumulado-label">Tiempo acumulado
          <button class="btn btn-ghost btn-sm" data-accion="ajustar" data-i="${i}" title="Corregir acumulado">✎</button>
        </div>
        <div class="botones">
          <button class="btn btn-start" data-accion="iniciar" data-i="${i}" ${corriendo ? 'disabled' : ''}>▶ Inicio</button>
          <button class="btn btn-stop" data-accion="pausar" data-i="${i}" ${corriendo ? '' : 'disabled'}>■ Detener</button>
          <button class="btn btn-fin" data-accion="finalizar" data-i="${i}">✔ Finalizar y trasladar</button>
        </div>
      </div>`;
  }).join('');
}

$('empresas').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-accion]');
  if (!btn) return;
  const empresa = EMPRESAS[btn.dataset.i];
  ({ iniciar, pausar, finalizar, ajustar })[btn.dataset.accion](empresa);
});

function tick() {
  let titulo = 'Control de Tiempo';
  document.querySelectorAll('[data-reloj]').forEach((el) => {
    const e = EMPRESAS[el.dataset.reloj];
    const t = reloj(tiempoActual(e));
    el.textContent = t;
    if (state.cronos[e].inicio) titulo = `⏱ ${t} · ${e}`;
  });
  document.title = titulo;
}
setInterval(tick, 1000);

function filasFiltradas() {
  const mes = $('f-mes').value;
  return state.control
    .filter((f) => !mes || f.mes === mes)
    .sort((a, b) => b.mes.localeCompare(a.mes) || EMPRESAS.indexOf(a.empresa) - EMPRESAS.indexOf(b.empresa));
}

function renderFiltroMes() {
  const sel = $('f-mes');
  const actual = sel.value;
  const meses = [...new Set(state.control.map((f) => f.mes))].sort().reverse();
  sel.innerHTML = '<option value="">Todos los meses</option>' +
    meses.map((m) => `<option value="${m}">${nombreMes(m)}</option>`).join('');
  sel.value = meses.includes(actual) ? actual : '';
}

const costoHora = (imp, ms) => (ms ? fmtPesos(imp / horasDec(ms)) : '—');
const costoMinuto = (imp, ms) => (ms ? fmtPesos(imp / (ms / MINUTO)) : '—');

function renderControl() {
  const filas = filasFiltradas();
  $('sin-control').hidden = filas.length > 0;
  $('control').innerHTML = filas.map((f) => `
    <tr>
      <td>${nombreMes(f.mes)}</td>
      <td>${escapeHtml(f.empresa)}</td>
      <td class="num">${reloj(f.ms)}</td>
      <td class="num">${fmtHoras(f.ms)}</td>
      <td class="num">${f.importe != null ? fmtPesos(f.importe) : '<span class="pendiente">pendiente</span>'}</td>
      <td class="num">${f.importe != null ? costoHora(f.importe, f.ms) : '—'}</td>
      <td class="num">${f.importe != null ? costoMinuto(f.importe, f.ms) : '—'}</td>
      <td>
        <button class="btn btn-ghost btn-sm" data-imp="${escapeHtml(f.id)}">${f.importe != null ? '✎ Importe' : '+ Importe'}</button>
        <button class="btn btn-ghost btn-sm" data-del="${escapeHtml(f.id)}" title="Eliminar">🗑</button>
      </td>
    </tr>`).join('');

  if (!filas.length) {
    $('control-total').innerHTML = '';
    return;
  }
  const ms = filas.reduce((s, f) => s + f.ms, 0);
  const conImporte = filas.filter((f) => f.importe != null);
  const imp = conImporte.reduce((s, f) => s + f.importe, 0);
  const msFact = conImporte.reduce((s, f) => s + f.ms, 0);
  $('control-total').innerHTML = `
    <tr>
      <td colspan="2">Total</td>
      <td class="num">${reloj(ms)}</td>
      <td class="num">${fmtHoras(ms)}</td>
      <td class="num">${fmtPesos(imp)}</td>
      <td class="num">${costoHora(imp, msFact)}</td>
      <td class="num">${costoMinuto(imp, msFact)}</td>
      <td></td>
    </tr>`;
}

$('control').addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) return;
  if (btn.dataset.imp) {
    const fila = state.control.find((f) => f.id === btn.dataset.imp);
    if (fila) pedirImporte(fila);
  }
  if (btn.dataset.del) {
    const id = btn.dataset.del;
    if (await confirmar('¿Eliminar esta fila del cuadro de control?')) {
      borrarFila(id);
      render();
    }
  }
});

$('f-mes').addEventListener('change', renderControl);

function render() {
  renderEmpresas();
  renderFiltroMes();
  renderControl();
  tick();
}

// ---------------------------------------------------------------------------
// Exportar
// ---------------------------------------------------------------------------
$('btn-csv').addEventListener('click', () => {
  const celda = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const num = (n) => n.toFixed(2).replace('.', ',');
  const filas = [['Mes', 'Empresa', 'Tiempo (hh:mm:ss)', 'Horas', 'Importe facturado', 'Costo por hora', 'Costo por minuto']]
    .concat(filasFiltradas().map((f) => [
      nombreMes(f.mes), f.empresa, reloj(f.ms), num(horasDec(f.ms)),
      f.importe != null ? num(f.importe) : '',
      f.importe != null ? num(f.importe / horasDec(f.ms)) : '',
      f.importe != null ? num(f.importe / (f.ms / MINUTO)) : '',
    ]));
  // Separador ";" y BOM para que Excel en español lo abra correctamente.
  const csv = '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
  descargar(`cuadro-control-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
});

// ---------------------------------------------------------------------------
// Archivo de datos (versión descargada)
// ---------------------------------------------------------------------------
// En Chrome y Edge de escritorio el programa guarda cada cambio en un archivo
// .json que elige el usuario; así los datos no dependen del navegador.
// En otros navegadores se ofrece la copia de seguridad manual.
const soportaArchivo = typeof window.showSaveFilePicker === 'function';
let archivo = null;        // FileSystemFileHandle vinculado
let archivoListo = false;  // permiso concedido y datos leídos
let guardandoArchivo = Promise.resolve();
let archivoPendiente = false;

// IndexedDB guarda el vínculo al archivo entre sesiones.
function idb(modo, fn) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('control-tiempo', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      try {
        const tx = req.result.transaction('kv', modo);
        const r = fn(tx.objectStore('kv'));
        tx.oncomplete = () => resolve(r && r.result);
        tx.onerror = () => reject(tx.error);
      } catch (e) {
        reject(e);
      }
    };
  });
}
const leerVinculo = () => idb('readonly', (st) => st.get('archivo')).catch(() => null);
const guardarVinculo = (h) => idb('readwrite', (st) => st.put(h, 'archivo')).catch(() => {});

function guardarArchivo() {
  if (!archivo || !archivoListo || archivoPendiente) return;
  // Agrupar cambios seguidos en una sola escritura.
  archivoPendiente = true;
  guardandoArchivo = guardandoArchivo.then(async () => {
    archivoPendiente = false;
    try {
      const w = await archivo.createWritable();
      await w.write(JSON.stringify(state, null, 2));
      await w.close();
    } catch (e) {
      console.error(e);
      archivoListo = false;
      aviso('No se pudo guardar en el archivo de datos. Volvé a conectarlo.');
      renderArchivo();
    }
  });
}

async function leerArchivo() {
  const txt = await (await archivo.getFile()).text();
  if (!txt.trim()) return null;
  const data = JSON.parse(txt);
  if (!data || !data.cronos || !Array.isArray(data.control)) throw new Error('El archivo no es de Control de Tiempo.');
  return data;
}

// Conecta el archivo: si tiene datos, los carga; si está vacío, guarda los actuales.
async function activarArchivo(h, { pedirPermiso }) {
  archivo = h;
  archivoListo = false;
  const opts = { mode: 'readwrite' };
  let permiso = await h.queryPermission(opts);
  if (permiso !== 'granted' && pedirPermiso) permiso = await h.requestPermission(opts);
  if (permiso !== 'granted') {
    renderArchivo();
    return;
  }
  try {
    const data = await leerArchivo();
    archivoListo = true;
    if (data) {
      state = normalizar(data);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* sin storage */ }
    } else {
      guardarArchivo();
    }
    render();
    await guardarVinculo(h);
  } catch (e) {
    archivo = null;
    aviso('No se pudo leer el archivo: ' + e.message);
  }
  renderArchivo();
}

function renderArchivo() {
  const conectado = archivo && archivoListo;
  const el = $('guardado');
  el.className = 'guardado ' + (conectado ? 'nube' : 'local');
  if (conectado) {
    el.textContent = `✓ Datos guardados en el archivo "${archivo.name}"`;
    $('archivo-txt').textContent = `Cada cambio se guarda automáticamente en "${archivo.name}". ` +
      'Conservá ese archivo: ahí están todos tus datos.';
  } else if (archivo) {
    el.textContent = '⚠ Falta reconectar el archivo de datos';
    $('archivo-txt').textContent = 'Por seguridad, el navegador pide permiso para usar el archivo de datos cada vez que abrís el programa.';
  } else if (soportaArchivo) {
    el.textContent = '⚠ Datos guardados solo en este navegador';
    $('archivo-txt').textContent = 'Creá un archivo de datos (por ejemplo en Documentos) para que tus registros queden guardados en la computadora y no se pierdan. Si ya tenés uno, abrilo.';
  } else {
    el.textContent = '⚠ Datos guardados solo en este navegador';
    $('archivo-txt').textContent = 'Este navegador no permite guardar en un archivo automáticamente. Usá Chrome o Edge, o descargá una copia de seguridad cada vez que termines.';
  }
  $('btn-reconectar').hidden = !(archivo && !archivoListo);
  $('btn-reconectar').textContent = archivo ? `Reconectar "${archivo.name}"` : '';
  $('btn-crear-archivo').hidden = !soportaArchivo || conectado || !!archivo;
  $('btn-abrir-archivo').hidden = !soportaArchivo || conectado;
}

async function iniciarModoArchivo() {
  $('panel-archivo').hidden = false;
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* opcional */ }
  if (soportaArchivo) {
    const h = await leerVinculo();
    if (h) await activarArchivo(h, { pedirPermiso: false });
  }
  renderArchivo();
}

const TIPOS_JSON = [{ description: 'Datos de Control de Tiempo', accept: { 'application/json': ['.json'] } }];

$('btn-crear-archivo').addEventListener('click', async () => {
  try {
    const h = await window.showSaveFilePicker({ suggestedName: 'control-tiempo-datos.json', types: TIPOS_JSON });
    // Un archivo nuevo empieza vacío: se guardan los datos actuales.
    const w = await h.createWritable();
    await w.write(JSON.stringify(state, null, 2));
    await w.close();
    await activarArchivo(h, { pedirPermiso: true });
    aviso('Archivo de datos creado.');
  } catch (e) {
    if (e.name !== 'AbortError') aviso('No se pudo crear el archivo: ' + e.message);
  }
});

$('btn-abrir-archivo').addEventListener('click', async () => {
  try {
    const [h] = await window.showOpenFilePicker({ types: TIPOS_JSON });
    await activarArchivo(h, { pedirPermiso: true });
  } catch (e) {
    if (e.name !== 'AbortError') aviso('No se pudo abrir el archivo: ' + e.message);
  }
});

$('btn-reconectar').addEventListener('click', () => activarArchivo(archivo, { pedirPermiso: true }));

$('btn-backup').addEventListener('click', () => {
  descargar(`control-tiempo-copia-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(state, null, 2), 'application/json');
});

$('in-restore').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || !data.cronos || !Array.isArray(data.control)) throw new Error('el archivo no es una copia de Control de Tiempo');
    if (!(await confirmar('Se reemplazarán los datos actuales por los de la copia. ¿Continuar?', 'Restaurar'))) return;
    state = normalizar(data);
    guardarLocal();
    render();
    aviso('Copia restaurada.');
  } catch (e) {
    aviso('No se pudo restaurar: ' + e.message);
  }
});

render();
conectarNube();
