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
// Persistencia
// ---------------------------------------------------------------------------
// Estructura guardada:
// {
//   cronos:  { [empresa]: { acumulado: ms, inicio: ms | null } },
//   control: [{ id, mes: 'AAAA-MM', empresa, ms, importe: number | null }]
// }
const STORAGE_KEY = 'control-tiempo-v2';

function cargar() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { /* sin datos */ }
  return normalizar(data);
}

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

let state = cargar();

function guardar() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    alert('No se pudieron guardar los datos en este navegador: ' + e.message);
  }
}

// Mantener sincronizadas varias pestañas abiertas.
window.addEventListener('storage', (ev) => {
  if (ev.key === STORAGE_KEY) {
    state = cargar();
    render();
  }
});

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const HORA = 3600000;

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

function descargar(nombre, contenido, tipo) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Abre un <dialog> y resuelve con true si se confirmó con el botón "ok".
function preguntar(dlg) {
  return new Promise((resolve) => {
    dlg.returnValue = '';
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    dlg.showModal();
  });
}

// ---------------------------------------------------------------------------
// Cronómetros
// ---------------------------------------------------------------------------
function tiempoActual(empresa) {
  const c = state.cronos[empresa];
  return c.acumulado + (c.inicio ? Date.now() - c.inicio : 0);
}

function detener(empresa) {
  const c = state.cronos[empresa];
  if (!c.inicio) return;
  c.acumulado += Date.now() - c.inicio;
  c.inicio = null;
}

function iniciar(empresa) {
  // Solo una empresa corriendo a la vez: las demás se detienen (su tiempo queda acumulado).
  for (const e of EMPRESAS) if (e !== empresa) detener(e);
  state.cronos[empresa].inicio = Date.now();
  guardar();
  render();
}

function pausar(empresa) {
  detener(empresa);
  guardar();
  render();
}

async function finalizar(empresa) {
  detener(empresa);
  guardar();
  render();

  const ms = state.cronos[empresa].acumulado;
  if (ms < 1000) {
    alert(`${empresa} no tiene tiempo acumulado para finalizar.`);
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
  guardar();
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
  guardar();
  render();
}

function actualizarPreview(fila) {
  const imp = parseImporte($('in-importe').value);
  $('imp-preview').textContent = imp > 0
    ? `Costo por hora: ${fmtPesos(imp / horasDec(fila.ms))}`
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
  detener(empresa);
  guardar();
  render();
  const min = Math.round(state.cronos[empresa].acumulado / 60000);
  $('aj-empresa').textContent = empresa;
  $('aj-h').value = Math.floor(min / 60);
  $('aj-m').value = min % 60;
  if (!(await preguntar($('dlg-ajuste')))) return;
  const h = Math.max(0, parseInt($('aj-h').value, 10) || 0);
  const m = Math.max(0, parseInt($('aj-m').value, 10) || 0);
  state.cronos[empresa].acumulado = (h * 60 + m) * 60000;
  guardar();
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
      <td class="num">${f.importe != null ? fmtPesos(f.importe / horasDec(f.ms)) : '—'}</td>
      <td>
        <button class="btn btn-ghost btn-sm" data-imp="${f.id}">${f.importe != null ? '✎ Importe' : '+ Importe'}</button>
        <button class="btn btn-ghost btn-sm" data-del="${f.id}" title="Eliminar">🗑</button>
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
      <td class="num">${msFact ? fmtPesos(imp / horasDec(msFact)) : '—'}</td>
      <td></td>
    </tr>`;
}

$('control').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) return;
  if (btn.dataset.imp) pedirImporte(state.control.find((f) => f.id === btn.dataset.imp));
  if (btn.dataset.del && confirm('¿Eliminar esta fila del cuadro de control?')) {
    state.control = state.control.filter((f) => f.id !== btn.dataset.del);
    guardar();
    render();
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
// Exportar / respaldo
// ---------------------------------------------------------------------------
$('btn-csv').addEventListener('click', () => {
  const celda = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const num = (n) => n.toFixed(2).replace('.', ',');
  const filas = [['Mes', 'Empresa', 'Tiempo (hh:mm:ss)', 'Horas', 'Importe facturado', 'Costo por hora']]
    .concat(filasFiltradas().map((f) => [
      nombreMes(f.mes), f.empresa, reloj(f.ms), num(horasDec(f.ms)),
      f.importe != null ? num(f.importe) : '',
      f.importe != null ? num(f.importe / horasDec(f.ms)) : '',
    ]));
  // Separador ";" y BOM para que Excel en español lo abra correctamente.
  const csv = '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
  descargar(`cuadro-control-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
});

$('btn-backup').addEventListener('click', () => {
  descargar(`control-tiempo-backup-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(state, null, 2), 'application/json');
});

$('in-restore').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || !data.cronos || !Array.isArray(data.control)) throw new Error('formato inválido');
    if (!confirm('Se reemplazarán los datos actuales por los del archivo. ¿Continuar?')) return;
    state = normalizar(data);
    guardar();
    render();
  } catch (e) {
    alert('No se pudo restaurar el archivo: ' + e.message);
  }
});

render();
