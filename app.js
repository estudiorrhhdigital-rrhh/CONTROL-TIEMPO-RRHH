'use strict';

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------
// Estructura guardada:
// {
//   registros: [{ id, empresa, proyecto, descripcion, inicio, fin }],  // inicio/fin en ms
//   activo: { empresa, proyecto, descripcion, inicio } | null
// }
const STORAGE_KEY = 'control-tiempo-v1';

function cargar() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data && Array.isArray(data.registros)) return data;
  } catch (e) { /* datos corruptos o storage no disponible */ }
  return { registros: [], activo: null };
}

let state = cargar();

function guardar() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    alert('No se pudieron guardar los datos en este navegador: ' + e.message);
  }
}

// Si el programa está abierto en varias pestañas, mantenerlas sincronizadas.
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

const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const pad = (n) => String(n).padStart(2, '0');

function reloj(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

function horas(ms) {
  const min = Math.round(ms / 60000);
  return `${Math.floor(min / 60)} h ${pad(min % 60)} min`;
}

const horasDecimal = (ms) => (ms / 3600000).toFixed(2);

const fecha = (ms) => new Date(ms).toLocaleDateString('es-AR');
const hora = (ms) => new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

// Valor para <input type="datetime-local"> en hora local.
function aInputLocal(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const limpiar = (s) => (s || '').trim().replace(/\s+/g, ' ');

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function descargar(nombre, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------------------
// Cronómetro
// ---------------------------------------------------------------------------
function iniciar(empresa, proyecto, descripcion) {
  if (state.activo) finalizar(); // solo un cronómetro a la vez
  state.activo = { empresa, proyecto, descripcion, inicio: Date.now() };
  guardar();
  render();
}

function finalizar() {
  const a = state.activo;
  if (!a) return;
  const fin = Date.now();
  // Ignorar arranques accidentales de menos de 1 segundo.
  if (fin - a.inicio >= 1000) {
    state.registros.push({ id: nuevoId(), ...a, fin });
  }
  state.activo = null;
  guardar();
  render();
}

function descartar() {
  if (!state.activo) return;
  if (!confirm('¿Descartar el tiempo en curso sin guardarlo?')) return;
  state.activo = null;
  guardar();
  render();
}

$('timer-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const empresa = limpiar($('t-empresa').value);
  if (!empresa) return;
  iniciar(empresa, limpiar($('t-proyecto').value), limpiar($('t-descripcion').value));
});
$('btn-stop').addEventListener('click', finalizar);
$('btn-cancel').addEventListener('click', descartar);

// Al cambiar la empresa, sugerir solo sus proyectos.
$('t-empresa').addEventListener('input', () => renderListas($('t-empresa').value));
$('d-empresa').addEventListener('input', () => renderListas($('d-empresa').value));

function tick() {
  const a = state.activo;
  if (a) {
    const t = reloj(Date.now() - a.inicio);
    $('timer-display').textContent = t;
    document.title = `⏱ ${t} · ${a.empresa}`;
  } else {
    $('timer-display').textContent = '00:00:00';
    document.title = 'Control de Tiempo';
  }
}
setInterval(tick, 1000);

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------
function rangoPeriodo() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dia = 86400000;
  switch ($('f-periodo').value) {
    case 'hoy':
      return [hoy.getTime(), hoy.getTime() + dia];
    case 'semana': { // lunes a domingo
      const lunes = new Date(hoy);
      lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
      const prox = new Date(lunes);
      prox.setDate(lunes.getDate() + 7);
      return [lunes.getTime(), prox.getTime()];
    }
    case 'mes':
      return [new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime(),
              new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1).getTime()];
    case 'mes-ant':
      return [new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1).getTime(),
              new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime()];
    case 'rango': {
      const d = $('f-desde').value, h = $('f-hasta').value;
      const desde = d ? new Date(d + 'T00:00').getTime() : -Infinity;
      const hasta = h ? new Date(h + 'T00:00').getTime() + dia : Infinity;
      return [desde, hasta];
    }
    default:
      return [-Infinity, Infinity];
  }
}

function registrosFiltrados() {
  const [desde, hasta] = rangoPeriodo();
  const emp = $('f-empresa').value;
  return state.registros
    .filter((r) => r.inicio >= desde && r.inicio < hasta && (!emp || r.empresa === emp))
    .sort((a, b) => b.inicio - a.inicio);
}

$('f-periodo').addEventListener('change', () => {
  const rango = $('f-periodo').value === 'rango';
  $('f-desde').hidden = !rango;
  $('f-hasta').hidden = !rango;
  render();
});
['f-desde', 'f-hasta', 'f-empresa'].forEach((id) => $(id).addEventListener('change', render));

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function empresas() {
  return [...new Set(state.registros.map((r) => r.empresa))].sort((a, b) => a.localeCompare(b, 'es'));
}

function renderListas(empresa) {
  const emp = limpiar(empresa);
  $('lista-empresas').innerHTML = empresas().map((e) => `<option value="${escapeHtml(e)}">`).join('');
  const proyectos = new Set(state.registros
    .filter((r) => r.proyecto && (!emp || r.empresa === emp))
    .map((r) => r.proyecto));
  $('lista-proyectos').innerHTML = [...proyectos].sort().map((p) => `<option value="${escapeHtml(p)}">`).join('');
}

function renderTimer() {
  const a = state.activo;
  const corriendo = !!a;
  $('timer-card').classList.toggle('running', corriendo);
  $('btn-start').hidden = corriendo;
  $('btn-stop').hidden = !corriendo;
  $('btn-cancel').hidden = !corriendo;
  ['t-empresa', 't-proyecto', 't-descripcion'].forEach((id) => { $(id).disabled = corriendo; });

  if (corriendo) {
    $('t-empresa').value = a.empresa;
    $('t-proyecto').value = a.proyecto;
    $('t-descripcion').value = a.descripcion;
    $('timer-status').textContent =
      `Trabajando en ${a.empresa}${a.proyecto ? ' · ' + a.proyecto : ''} desde las ${hora(a.inicio)}`;
  } else {
    $('timer-status').textContent = 'Sin tarea en curso';
  }

  // Accesos rápidos: últimas combinaciones empresa/proyecto usadas.
  const vistos = new Set();
  const recientes = [];
  for (const r of [...state.registros].sort((x, y) => y.inicio - x.inicio)) {
    const k = r.empresa + '\u0000' + r.proyecto;
    if (vistos.has(k)) continue;
    vistos.add(k);
    recientes.push(r);
    if (recientes.length === 6) break;
  }
  $('recientes').innerHTML = recientes.length
    ? '<span class="subtitle">Recientes:</span>' + recientes.map((r, i) =>
        `<button type="button" class="chip" data-i="${i}">▶ ${escapeHtml(r.empresa)}${r.proyecto ? ' · ' + escapeHtml(r.proyecto) : ''}</button>`).join('')
    : '';
  $('recientes').querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = recientes[btn.dataset.i];
      iniciar(r.empresa, r.proyecto, '');
    });
  });
  tick();
}

function renderFiltroEmpresas() {
  const sel = $('f-empresa');
  const actual = sel.value;
  sel.innerHTML = '<option value="">Todas las empresas</option>' +
    empresas().map((e) => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join('');
  sel.value = empresas().includes(actual) ? actual : '';
}

function renderResumen(lista) {
  const porEmpresa = new Map();
  let total = 0;
  for (const r of lista) {
    const dur = r.fin - r.inicio;
    total += dur;
    if (!porEmpresa.has(r.empresa)) porEmpresa.set(r.empresa, { total: 0, proyectos: new Map() });
    const e = porEmpresa.get(r.empresa);
    e.total += dur;
    const p = r.proyecto || '(sin proyecto)';
    e.proyectos.set(p, (e.proyectos.get(p) || 0) + dur);
  }
  $('total-general').textContent = horas(total);

  const filas = [...porEmpresa.entries()].sort((a, b) => b[1].total - a[1].total);
  $('resumen').innerHTML = filas.map(([nombre, e]) => `
    <div class="empresa-bloque">
      <div class="empresa-fila"><span>${escapeHtml(nombre)}</span><span>${horas(e.total)} (${horasDecimal(e.total)} h)</span></div>
      <div class="barra" style="width:${total ? (e.total / total * 100).toFixed(1) : 0}%"></div>
      ${[...e.proyectos.entries()].sort((a, b) => b[1] - a[1]).map(([p, d]) =>
        `<div class="proyecto-fila"><span>${escapeHtml(p)}</span><span>${horas(d)}</span></div>`).join('')}
    </div>`).join('');
}

function renderRegistros(lista) {
  $('sin-registros').hidden = lista.length > 0;
  $('registros').innerHTML = lista.map((r) => `
    <tr>
      <td>${fecha(r.inicio)}</td>
      <td>${escapeHtml(r.empresa)}</td>
      <td>${escapeHtml(r.proyecto || '')}</td>
      <td class="desc">${escapeHtml(r.descripcion || '')}</td>
      <td class="num">${hora(r.inicio)}</td>
      <td class="num">${hora(r.fin)}</td>
      <td class="num">${reloj(r.fin - r.inicio)}</td>
      <td>
        <button class="btn btn-ghost btn-sm" data-edit="${r.id}" title="Editar">✎</button>
        <button class="btn btn-ghost btn-sm" data-del="${r.id}" title="Eliminar">🗑</button>
      </td>
    </tr>`).join('');
}

$('registros').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) return;
  if (btn.dataset.edit) abrirDialogo(state.registros.find((r) => r.id === btn.dataset.edit));
  if (btn.dataset.del && confirm('¿Eliminar este registro?')) {
    state.registros = state.registros.filter((r) => r.id !== btn.dataset.del);
    guardar();
    render();
  }
});

function render() {
  renderListas($('t-empresa').value);
  renderTimer();
  renderFiltroEmpresas();
  const lista = registrosFiltrados();
  renderResumen(lista);
  renderRegistros(lista);
}

// ---------------------------------------------------------------------------
// Edición y carga manual
// ---------------------------------------------------------------------------
let editando = null; // registro en edición, o null para uno nuevo

function abrirDialogo(registro) {
  editando = registro || null;
  $('dlg-title').textContent = registro ? 'Editar registro' : 'Carga manual';
  const ahora = Date.now();
  const r = registro || { empresa: '', proyecto: '', descripcion: '', inicio: ahora - 3600000, fin: ahora };
  $('d-empresa').value = r.empresa;
  $('d-proyecto').value = r.proyecto || '';
  $('d-descripcion').value = r.descripcion || '';
  $('d-inicio').value = aInputLocal(r.inicio);
  $('d-fin').value = aInputLocal(r.fin);
  $('dlg-error').textContent = '';
  renderListas(r.empresa);
  $('dlg').showModal();
}

$('btn-manual').addEventListener('click', () => abrirDialogo(null));

$('dlg-ok').addEventListener('click', (ev) => {
  const empresa = limpiar($('d-empresa').value);
  const inicio = new Date($('d-inicio').value).getTime();
  const fin = new Date($('d-fin').value).getTime();
  let error = '';
  if (!empresa) error = 'Indicá la empresa.';
  else if (isNaN(inicio) || isNaN(fin)) error = 'Completá inicio y fin.';
  else if (fin <= inicio) error = 'El fin debe ser posterior al inicio.';
  if (error) {
    ev.preventDefault();
    $('dlg-error').textContent = error;
    return;
  }
  const datos = {
    empresa,
    proyecto: limpiar($('d-proyecto').value),
    descripcion: limpiar($('d-descripcion').value),
    inicio,
    fin,
  };
  if (editando) Object.assign(editando, datos);
  else state.registros.push({ id: nuevoId(), ...datos });
  guardar();
  render();
});

// ---------------------------------------------------------------------------
// Exportar / respaldo
// ---------------------------------------------------------------------------
$('btn-csv').addEventListener('click', () => {
  const lista = registrosFiltrados().slice().reverse();
  const celda = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const filas = [['Fecha', 'Empresa', 'Proyecto', 'Descripción', 'Inicio', 'Fin', 'Duración (hh:mm:ss)', 'Horas']]
    .concat(lista.map((r) => [
      fecha(r.inicio), r.empresa, r.proyecto || '', r.descripcion || '',
      hora(r.inicio), hora(r.fin), reloj(r.fin - r.inicio), horasDecimal(r.fin - r.inicio).replace('.', ','),
    ]));
  // Separador ";" y BOM para que Excel en español lo abra correctamente.
  const csv = '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
  descargar(`horas-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
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
    if (!data || !Array.isArray(data.registros)) throw new Error('formato inválido');
    if (!confirm(`Se reemplazarán los datos actuales por ${data.registros.length} registros del archivo. ¿Continuar?`)) return;
    state = { registros: data.registros, activo: data.activo || null };
    guardar();
    render();
  } catch (e) {
    alert('No se pudo restaurar el archivo: ' + e.message);
  }
});

render();
