# Control de Tiempo

Programa sencillo para registrar el tiempo trabajado por **empresa** y **proyecto**
con un cronómetro de inicio/fin.

## Cómo usarlo

1. Abrí `index.html` en el navegador (doble clic; no requiere instalación ni internet).
2. Escribí la **empresa**, opcionalmente el **proyecto** y una descripción, y tocá **▶ Iniciar**.
3. Cuando terminás, tocá **■ Finalizar**: el tiempo queda guardado como registro.

## Funciones

- Un cronómetro activo a la vez; si iniciás otra tarea, la anterior se finaliza sola.
- El cronómetro sigue corriendo aunque cierres o recargues la página.
- Accesos rápidos a las últimas empresas/proyectos usados.
- Resumen de horas por empresa y proyecto (hoy, semana, mes, mes anterior, rango o todo).
- Edición y eliminación de registros, y carga manual de horas olvidadas.
- Exportación a CSV (se abre directo en Excel) del período filtrado.
- Copia de seguridad y restauración en JSON.

## Dónde se guardan los datos

Los datos quedan en el almacenamiento local del navegador (`localStorage`), en esa
computadora y ese navegador. Usá **Copia de seguridad** periódicamente y **Restaurar**
para pasar los datos a otro equipo.

## Publicarlo en línea (opcional)

Activando **GitHub Pages** en este repositorio (Settings → Pages → rama principal, carpeta raíz)
el programa queda disponible desde cualquier dispositivo, incluido el celular.
Cada dispositivo guarda sus propios registros.
