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
// Si la página se abre como archivo suelto, se usa el almacenamiento del navegador.
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
    marcarGuardado(false);
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

function confirmar(txt) {
  $('confirm-txt').textContent = txt;
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

render();
conectarNube();
