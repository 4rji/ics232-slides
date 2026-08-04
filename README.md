# CCDC Terminal Presentation

Presentacion en browser con estilo de terminal usando Reveal.js.

## Uso

```bash
npm install
npm run dev
```

Abre el URL que imprime el servidor. El servidor escucha en `0.0.0.0`, asi que otros equipos en la misma red pueden conectarse usando la IP local de esta computadora. Durante la presentacion:

- Flechas: avanzar o retroceder.
- `S`: abrir notas del presentador en otra ventana.
- `F`: activar o salir de pantalla completa en `/`, `/view`, `/cyber404`, `/index` y `/slides`.
- `Esc`: vista general de slides.
- No hay controles visuales en pantalla; esta pensada para manejarse con teclado.
- Cada diapositiva escribe primero el comando y despues muestra la salida como terminal.
- Todas las ventanas conectadas al mismo servidor se sincronizan con la diapositiva activa.
- La diapositiva activa se guarda en disco y en el navegador, y se restaura despues de recargar la pagina o reiniciar el servidor.
- Controla la presentacion desde `/cyber404`; abre `/` o `/view` en las pantallas que solo deben mirar.

Para abrirla desde otra computadora en la misma red, usa la IP local de la computadora que corre el servidor, por ejemplo `http://192.168.1.20:5173/cyber404` para controlar y `http://192.168.1.20:5173/` para solo ver. `127.0.0.1` solo funciona desde la misma computadora que corre el servidor.

El servidor de desarrollo acepta cualquier dominio en el header `Host`, asi que tambien puede funcionar detras de un tunel o proxy como `ccdclab.4rji.com`.

Para cambiar el puerto:

```bash
npm run dev -- --port 8888
```

Tambien puedes usar una variable de entorno:

```bash
PORT=8888 npm run dev
```

Para usar el puerto 80, puede que necesites permisos de administrador y que no haya otro servicio usando ese puerto:

```bash
sudo npm run dev -- --port 80
```

## Como editar

Edita `index.html`. Cada `<section>` es una diapositiva.

Para mostrar algo tipo terminal, usa:

```html
<pre class="terminal-body"><code><span class="prompt">ccdc ~$</span> cat team.txt
contenido aqui
</code></pre>
```

Para notas, agrega dentro del mismo `<section>`:

```html
<aside class="notes">
  Estas notas solo salen en la ventana del presentador.
</aside>
```

Para imagenes, pon archivos en `assets/` y usalos con:

```html
<img src="/assets/mi-imagen.png" alt="Descripcion" />
```
