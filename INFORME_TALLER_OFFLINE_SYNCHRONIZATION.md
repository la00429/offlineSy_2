# Informe del taller: Offline Synchronization

## Objetivo de la solución

La aplicación implementa un flujo completo de sincronización offline:

1. El servidor Express persiste los mensajes en la colección MongoDB `mensajes` mediante Mongoose.
2. El navegador conserva los mensajes pendientes en el ObjectStore nativo de IndexedDB `mensajes-offline`.
3. El Service Worker intercepta los POST, activa Background Sync y reintenta el envío al recuperar la conexión.
4. Los mensajes confirmados se guardan en el almacén local `mensajes` y se actualiza el caché dinámico de `GET /api`.
5. La interfaz informa cada estado mediante Toasts.

MongoDB sí es necesario para demostrar la persistencia permanente. Sin MongoDB activo solo se pueden validar la sintaxis, el código del Service Worker y el almacenamiento local.

## Prerrequisitos y configuración

Node.js y npm se validan con:

```bash
node --version
npm --version
```

Instalar dependencias:

```bash
npm install
```

Configurar MongoDB copiando `.env.example` como `.env`. La configuración local predeterminada es:

```text
MONGODB_URI=mongodb://127.0.0.1:27017/offlineSy
PORT=3000
```

Iniciar el servidor:

```bash
npm start
```

Para probar la API se puede utilizar Postman. Para probar el modo offline se necesitan Chrome DevTools, especialmente las pestañas **Network**, **Application > IndexedDB**, **Application > Cache Storage** y **Application > Service Workers**.

## 1. Esquema de base de datos principal

**Commit:** `9e1b12f`.

**Archivo y código:** `server/mensajes.js` define el esquema Mongoose `Mensaje` y lo guarda explícitamente en la colección `mensajes`. `server/routes.js` importa este modelo para las operaciones CRUD:

```js
const mongoose = require('mongoose');

const mensajeSchema = new mongoose.Schema({
	user: { type: String, required: true, trim: true },
	mensaje: { type: String, required: true, trim: true }
});

const Mensaje = mongoose.model('Mensaje', mensajeSchema, 'mensajes');
```

```js
// server/routes.js
const Mensaje = require('./mensajes');
```

Cada registro de la colección `mensajes` es un documento independiente con `_id`, `user` y `mensaje`; MongoDB genera `_id` automáticamente. También se guardan los campos de fecha configurados por `timestamps`. No se crea un documento único que contenga todos los mensajes.

**Cómo evidenciarlo:**

1. Iniciar MongoDB y ejecutar `npm start`.
2. En Postman ejecutar `POST http://localhost:3000/api` con:
	 `{ "user": "spiderman", "mensaje": "Hola" }`.
3. Capturar la respuesta HTTP 200 con `ok: true`.
4. Capturar MongoDB Compass o la consola de MongoDB mostrando la colección `mensajes` con `_id`, `user` y `mensaje`.

## 2. ObjectStores del navegador

**Commit:** `a82f0ee`.

**Archivo y código:** `public/js/sw-db.js` crea el ObjectStore nativo de IndexedDB para pendientes y el almacén PouchDB para mensajes confirmados:

```js
const dbMensajes = new PouchDB('mensajes');
const offlineDatabaseName = 'offline-synchronization';
const offlineStoreName = 'mensajes-offline';

const request = indexedDB.open(offlineDatabaseName, 1);
request.onupgradeneeded = event => {
	const database = event.target.result;
	database.createObjectStore(offlineStoreName, { keyPath: '_id' });
};
```

`mensajes-offline` es el ObjectStore nativo de pendientes solicitado. `guardarMensajeOffline` crea cada documento con `_id`, `user` y `mensaje`. El almacén PouchDB `mensajes` contiene la copia confirmada que coincide con la colección principal.

**Cómo evidenciarlo:** abrir DevTools > Application > IndexedDB, expandir la base `offline-synchronization` y mostrar el ObjectStore `mensajes-offline`. Antes de sincronizar, un mensaje pendiente debe estar únicamente allí.

## 3. POST, errores y almacenamiento pendiente

**Commit:** `63470bd`.

**Archivos y código:**

- `server/routes.js`, método `router.post('/')`: guarda el documento mediante `Mensaje.create()` y responde HTTP 200 con `{ ok: true, mensaje }`.
- `server/routes.js`: los errores de base de datos responden HTTP 503 con `tipoError: "base-de-datos"`.
- `public/js/sw-utils.js`, función `manejoApiMensajes`: intenta el `fetch` real. Ante una falla de red o respuesta 5xx llama a `guardarMensajeOffline`.

```js
router.post('/', async function(req, res) {
	const { user, mensaje } = req.body;

	if (!user || !mensaje || user.trim() === '' || mensaje.trim() === '') {
		return res.status(400).json({
			ok: false,
			mensaje: 'El usuario y el mensaje son obligatorios.'
		});
	}

	try {
		const nuevoMensaje = await Mensaje.create({
			user: user.trim(),
			mensaje: mensaje.trim()
		});

		res.status(200).json({ ok: true, mensaje: nuevoMensaje });
	} catch (error) {
		res.status(503).json({
			ok: false,
			tipoError: 'base-de-datos',
			mensaje: 'No se pudo guardar el mensaje en la base de datos.'
		});
	}
});
```

```js
function manejoApiMensajes(cacheName, req) {
	if (req.clone().method === 'POST') {
		return req.clone().text().then(body => {
			const bodyObj = JSON.parse(body);

			return fetch(req.clone()).then(res => {
				if (res.ok) return res;
				if (res.status >= 500) return guardarMensajeOffline(bodyObj);
				return res;
			}).catch(() => guardarMensajeOffline(bodyObj));
		});
	}
}
```

**Cómo evidenciarlo:**

1. Con red y MongoDB activos, enviar un POST y capturar HTTP 200.
2. En DevTools > Network seleccionar **Offline**.
3. Enviar varios mensajes.
4. Capturar la respuesta `{ ok: true, offline: true }`.
5. Mostrar en IndexedDB que los documentos están en `mensajes-offline` y todavía no en `mensajes`.

## 4. Recuperación de conexión y Background Sync

**Commit:** `2f1e576`.

**Archivos y código:**

- `public/js/app.js`, función `isOnline`: comprueba `navigator.onLine` y solicita al Service Worker contar los pendientes antes de programar Background Sync.
- `public/js/sw-db.js`, función `postearMensajes`: lee `mensajes-offline`, ejecuta POST por cada documento y guarda la respuesta en `mensajes`.
- `public/sw.js`, evento `sync`: ejecuta `postearMensajes`.
- `public/js/sw-db.js`: elimina el pendiente únicamente después de recibir una respuesta exitosa con `ok: true`.

```js
function isOnline() {
	if (navigator.onLine) {
		sincronizarMensajesPendientes();
	} else {
		mostrarToast('Sin conexión. Los mensajes quedarán pendientes.', 'warning');
	}
}

function sincronizarMensajesPendientes() {
	return navigator.serviceWorker.ready.then(registration => {
		if (registration.active) {
			registration.active.postMessage({ type: 'comprobar-pendientes' });
		}
	});
}
```

El Service Worker solo registra `nuevo-post` cuando `mensajes-offline` contiene documentos:

```js
self.addEventListener('message', event => {
	if (!event.data || event.data.type !== 'comprobar-pendientes') return;

	event.waitUntil(listarMensajesOffline().then(docs => {
		const count = docs.rows.length;
		const sincronizacion = count && self.registration.sync
			? self.registration.sync.register('nuevo-post')
			: Promise.resolve();

		return sincronizacion.then(() => event.source.postMessage({
			type: 'pendientes-comprobados',
			count: count
		}));
	}));
});
```

```js
function postearMensajes() {
	return listarMensajesOffline().then(docs => {
		const posteos = docs.rows.map(row => {
			const documento = row.doc;
			const payload = {
				user: documento.user,
				mensaje: documento.mensaje
			};

			return fetch('api', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			}).then(respuesta => respuesta.json().then(respuestaJson => ({
				respuesta,
				respuestaJson
			}))).then(({ respuesta, respuestaJson }) => {
				if (!respuesta.ok || !respuestaJson.ok) {
					throw new Error(respuestaJson.mensaje);
				}

				return dbMensajes.put({
					...respuestaJson.mensaje,
					_id: String(respuestaJson.mensaje._id)
				}).then(() => eliminarMensajeOffline(documento));
			});
		});

		return Promise.all(posteos);
	});
}
```

```js
self.addEventListener('sync', e => {
	if (e.tag === 'nuevo-post') {
		e.waitUntil(
			postearMensajes()
				.then(mensajes => actualizarCacheMensajes(DYNAMIC_CACHE)
					.then(() => self.clients.matchAll({ type: 'window' }))
					.then(clientes => clientes.forEach(cliente => cliente.postMessage({
						type: 'mensajes-sincronizados',
						count: mensajes.length
					}))))
		);
	}
});
```

**Cómo evidenciarlo:**

1. Mantener varios mensajes en `mensajes-offline`.
2. Activar nuevamente la conexión desde DevTools > Network.
3. En Application > Service Workers observar el registro de Background Sync `nuevo-post` o los eventos del Service Worker.
4. Capturar MongoDB con los nuevos documentos persistidos.
5. Capturar IndexedDB mostrando los mensajes en `mensajes` y la ausencia de esos mismos documentos en `mensajes-offline`.

## 5. Caché dinámico y prevención de duplicados

**Commit:** `bbaeb63`.

**Archivos y código:**

- `public/js/sw-utils.js`, función `actualizarCacheMensajes`: vuelve a consultar `GET /api` después de sincronizar y reemplaza la entrada `/api` del caché dinámico.
- `public/sw.js`: ejecuta la actualización del caché después de `postearMensajes`.
- `public/js/app.js`, función `getMensajes`: limpia `timeline` antes de pintar la respuesta.

```js
function actualizarCacheMensajes(dynamicCache) {
	const request = new Request('/api', { method: 'GET' });

	return fetch(request).then(res => {
		if (!res.ok) return res;

		return caches.open(dynamicCache).then(cache =>
			cache.put(request, res.clone()).then(() => res)
		);
	});
}

function getMensajes() {
	fetch('/api')
		.then(res => res.json())
		.then(posts => {
			timeline.empty();
			posts.forEach(post => crearMensajeHTML(post.mensaje, post.user));
		});
}
```

**Cómo evidenciarlo:** sincronizar mensajes, abrir Application > Cache Storage > `dynamic-v1`, inspeccionar `/api` y recargar la página. La lista debe mostrar cada mensaje una sola vez y coincidir con MongoDB.

## 6. Notificaciones Toast

**Commit:** `827ddef`.

**Archivos y código:** `public/js/app.js` centraliza las notificaciones en `mostrarToast`, usando `$.mdtoast`. Se muestran mensajes para:

- Conexión restaurada y sincronización iniciada cuando existen pendientes.
- Modo offline y mensaje guardado como pendiente.
- Mensaje guardado en MongoDB.
- Sincronización terminada.
- Errores de conexión, validación o base de datos.

`public/sw.js` informa al cliente mediante `postMessage` cuando termina la sincronización.

```js
function mostrarToast(mensaje, tipo) {
	if (typeof $.mdtoast === 'function') {
		$.mdtoast(mensaje, {
			interaction: true,
			interactionTimeout: 2500,
			actionText: 'OK',
			type: tipo
		});
	}
}

navigator.serviceWorker.addEventListener('message', event => {
	if (event.data && event.data.type === 'pendientes-comprobados' && event.data.count > 0) {
		mostrarToast('Conexión restaurada. Sincronizando mensajes.', 'success');
	}

	if (event.data && event.data.type === 'mensajes-sincronizados') {
		getMensajes();
		mostrarToast(
			`${event.data.count} mensaje(s) sincronizado(s).`,
			'success'
		);
	}
});
```

**Cómo evidenciarlo:** repetir los escenarios online, offline, reconexión y error de servidor, y capturar cada Toast visible en la interfaz.

## 7. GET desde MongoDB y actualización local

**Commit:** `909d7bd`.

**Archivos y código:**

- `server/routes.js`, método `router.get('/')`: ejecuta `Mensaje.find().sort({ createdAt: 1 }).lean()` y retorna todos los registros de MongoDB.
- `public/js/sw-utils.js`: al recibir un GET correcto llama a `guardarMensajesLocales`, actualiza el caché dinámico y usa el almacén `mensajes` como respaldo si no existe red ni caché.
- `public/js/sw-db.js`: conserva `_rev` al actualizar documentos para evitar conflictos de PouchDB.

```js
router.get('/', async function (req, res) {
	try {
		const mensajes = await Mensaje.find()
			.sort({ createdAt: 1 })
			.lean();
		res.json(mensajes);
	} catch (error) {
		res.status(500).json({
			ok: false,
			mensaje: 'No se pudieron obtener los mensajes.'
		});
	}
});
```

```js
return fetch(req).then(res => {
	if (res.ok) {
		const respuesta = res.clone();
		return res.clone().json()
			.then(mensajes => guardarMensajesLocales(mensajes))
			.then(() => actualizaCacheDinamico(cacheName, req, respuesta));
	}

	return caches.match(req);
}).catch(() => caches.match(req).then(respuesta => {
	if (respuesta) return respuesta;

	return listarMensajesLocales().then(docs => new Response(
		JSON.stringify(docs.rows.map(row => row.doc)),
		{ headers: { 'Content-Type': 'application/json' } }
	));
}));
```

**Cómo evidenciarlo:** ejecutar `GET /api` desde Postman, comparar la respuesta con MongoDB y revisar IndexedDB > `mensajes`. Desconectar la red, recargar la aplicación y comprobar que la lista se muestra desde la copia local.

## 8. Prueba global del taller: escenario offline completo

Esta es la secuencia recomendada para las capturas o el video de entrega.

### 8.1 Preparación

1. Iniciar MongoDB.
2. Ejecutar `npm start`.
3. Abrir `http://localhost:3000` en Chrome.
4. Abrir DevTools y dejar visibles las pestañas **Network**, **Application > IndexedDB**, **Application > Cache Storage** y **Application > Service Workers**.
5. Capturar el estado inicial de los almacenes `mensajes-offline` y `mensajes`.

### 8.2 Crear mensajes sin conexión

1. En **Network**, activar **Offline**.
2. Enviar varios mensajes desde la aplicación.
3. Verificar que aparece el Toast de modo offline o mensaje pendiente.
4. En **Application > IndexedDB > mensajes-offline**, capturar los documentos con `user` y `mensaje`.
5. Mostrar que esos mensajes todavía no aparecen en `mensajes`.

### 8.3 Restaurar y comprobar Background Sync

1. Desactivar **Offline** para restaurar la conexión.
2. Esperar el evento `sync` o recargar la aplicación si el navegador solicita reactivar el Service Worker.
3. En **Network**, capturar los POST enviados a `/api`.
4. En MongoDB, capturar los documentos persistidos con `_id`, `user` y `mensaje`.
5. En IndexedDB, mostrar que los documentos fueron copiados a `mensajes` y eliminados de `mensajes-offline`.
6. Capturar el Toast que indica cuántos mensajes fueron sincronizados.

### 8.4 Comprobar caché y ausencia de duplicados

1. Abrir **Application > Cache Storage > dynamic-v1**.
2. Inspeccionar la respuesta almacenada para `/api`.
3. Recargar la página.
4. Capturar que cada mensaje aparece una sola vez y que coincide con MongoDB.

## 9. Resultado, commits y limitaciones

Los cambios se organizaron en commits independientes:

- `44ab8be`: documentar el esquema inicial.
- `a82f0ee`: crear almacenes offline.
- `63470bd`: guardar mensajes y manejar errores.
- `2f1e576`: sincronizar pendientes.
- `bbaeb63`: actualizar caché.
- `827ddef`: agregar Toasts.
- `909d7bd`: sincronizar GET y almacén local.
- `3200ccd`: informe inicial de validación.

La sintaxis JavaScript fue validada con `node --check`. La prueba funcional completa requiere MongoDB ejecutándose y un navegador compatible con Service Worker, IndexedDB y Background Sync. La entrega debe incluir este informe, el código fuente y las capturas o el video de las evidencias descritas.
