# Control de Tiempo

Programa para cronometrar el tiempo trabajado por empresa, trasladarlo a un
cuadro de control mensual y calcular el costo por hora según lo facturado.

Empresas: GRUPO TEBA, CONSOCIOS, IMAGEN, BLANCO, PILINA, INELECTO ALTA/SKY VISION.
(Se pueden cambiar en la lista `EMPRESAS` al inicio de `app.js`.)

## Cómo usarlo

Abrí `index.html` en el navegador (doble clic; no requiere instalación ni internet).

Cada empresa tiene su recuadro con:

- **▶ Inicio**: empieza a contar el tiempo de trabajo.
- **■ Detener**: pausa el conteo. El tiempo queda en el **cuadro de tiempo acumulado**
  y se sigue sumando cada vez que volvés a tocar Inicio.
- **✔ Finalizar y trasladar**: pasa el tiempo acumulado al **Cuadro de control**:
  1. pide el **mes** al que corresponde;
  2. pide el **importe de facturación** y calcula el **costo por hora**
     (importe ÷ horas trabajadas). El importe se puede cargar después con **+ Importe**.
- **✎** junto a "Tiempo acumulado": corrige a mano el acumulado (por ejemplo, si te
  olvidaste de detenerlo).

Notas:

- Solo una empresa cuenta a la vez: al iniciar otra, la anterior se detiene sola.
- El cronómetro sigue corriendo aunque cierres o recargues la página.
- Si finalizás dos veces la misma empresa en el mismo mes, el tiempo se suma a la misma fila.

## Cuadro de control

Muestra por mes y empresa: tiempo, horas, importe facturado y costo por hora, con totales.
Se puede filtrar por mes, exportar a CSV (se abre en Excel) y editar o eliminar filas.

## Dónde se guardan los datos

En el almacenamiento local del navegador (`localStorage`), en esa computadora y ese
navegador. Usá **Copia de seguridad** periódicamente y **Restaurar** para pasar los
datos a otro equipo.
