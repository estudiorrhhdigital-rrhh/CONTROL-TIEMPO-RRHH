# Control de Tiempo

Programa para cronometrar el tiempo trabajado por empresa, trasladarlo a un
cuadro de control mensual y calcular el costo por hora según lo facturado.

Empresas: GRUPO TEBA, CONSOCIOS, IMAGEN, BLANCO, PILINA, INELECTO ALTA/SKY VISION.
(Se pueden cambiar en la lista `EMPRESAS` al inicio de `app.js`.)

## Cómo usarlo

Usá el link publicado: https://claude.ai/artifact/J6kDKoEuQHt2CRSyqTYCMS
Ahí los datos se guardan en la nube y no se pierden al cerrar el navegador.

### Programa para descargar

`ControlDeTiempo.html` es el programa completo en un solo archivo (se regenera con
`python3 build.py`). Se abre con doble clic, preferentemente en Chrome o Edge.

La primera vez tocá **Crear archivo de datos** y guardalo, por ejemplo, en Documentos.
Desde ahí cada cambio se guarda en ese archivo. Al volver a abrir el programa, tocá
**Reconectar** para dar permiso. Si el navegador perdió el vínculo, usá **Abrir archivo
de datos existente** y elegí el mismo archivo.

Cada empresa tiene su recuadro con:

- **▶ Inicio**: empieza a contar el tiempo de trabajo.
- **■ Detener**: pausa el conteo. El tiempo queda en el **cuadro de tiempo acumulado**
  y se sigue sumando cada vez que volvés a tocar Inicio.
- **✔ Finalizar y trasladar**: pasa el tiempo acumulado al **Cuadro de control**:
  1. pide el **mes** al que corresponde;
  2. pide el **importe de facturación** y calcula el **costo por hora**
     (importe ÷ horas trabajadas, donde los minutos cuentan como fracción de hora:
     10 h 30 min = 10,5 h) y el **costo por minuto** (importe ÷ minutos trabajados). El importe se puede cargar después con **+ Importe**.
- **✎** junto a "Tiempo acumulado": corrige a mano el acumulado (por ejemplo, si te
  olvidaste de detenerlo).

Notas:

- Solo una empresa cuenta a la vez: al iniciar otra, la anterior se detiene sola.
- El cronómetro sigue corriendo aunque cierres o recargues la página.
- Si finalizás dos veces la misma empresa en el mismo mes, el tiempo se suma a la misma fila.

## Cuadro de control

Muestra por mes y empresa: tiempo, horas, importe facturado, costo por hora y costo por
minuto, con totales. Se puede filtrar por mes, exportar a Excel (CSV) y editar o eliminar filas.
