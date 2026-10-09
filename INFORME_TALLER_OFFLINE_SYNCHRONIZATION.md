# Informe del taller: Offline Synchronization

## Estado general

La aplicación usa Express, MongoDB mediante Mongoose, PouchDB sobre IndexedDB y un Service Worker para trabajar sin conexión.

## 1. Esquema de base de datos

**Implementación:** completada en el commit `9e1b12f`.

El modelo `Mensaje` de `server/routes.js` contiene los campos requeridos:

- `_id`: identificador generado por MongoDB.
- `user`: usuario que crea el mensaje.
- `mensaje`: contenido del mensaje.

MongoDB se configura mediante `MONGODB_URI`, con valor local por defecto `mongodb://127.0.0.1:27017/offlineSy`.

**Validación:**

1. Iniciar MongoDB.
2. Ejecutar `npm start`.
3. Consultar `GET http://localhost:3000/api`.
4. Enviar un `POST http://localhost:3000/api` con `{ "user": "spiderman", "mensaje": "Hola" }`.
5. Confirmar en la respuesta y en la colección `mensajes` que existe `_id`, `user` y `mensaje`.

## 2. ObjectStore para mensajes offline

**Implementación:** `public/js/sw-db.js` crea los almacenes PouchDB `mensajes-offline` y `mensajes`. PouchDB usa IndexedDB como almacenamiento del navegador.

El primer almacén conserva mensajes pendientes con `_id`, `user` y `mensaje`; el segundo conserva la copia local confirmada por el servidor.

**Validación:** abrir DevTools > Application > IndexedDB, crear un mensaje sin conexión y confirmar que aparece en `mensajes-offline`. La base `mensajes` se usará para la copia sincronizada.

## 3. POST y almacenamiento de mensajes pendientes

**Implementación:** el `POST /api` guarda el documento en MongoDB y responde HTTP 200 con `ok: true`. Los errores de base de datos responden HTTP 503 con `tipoError: "base-de-datos"`.

El Service Worker intenta primero la petición de red. Si falla la conexión o el servidor responde con un error 5xx, guarda el JSON en `mensajes-offline` y devuelve `ok: true, offline: true`. Los errores 4xx se conservan para que el cliente pueda mostrarlos.

**Validación:** con MongoDB activo, enviar un POST y comprobar HTTP 200. Después detener MongoDB o usar DevTools > Network > Offline, enviar otro mensaje y comprobar que aparece en `mensajes-offline`.

## 4. Sincronización al recuperar conexión

**Implementación:** `isOnline` registra `nuevo-post` al recuperar conexión. El evento `sync` del Service Worker ejecuta `postearMensajes`, que envía los pendientes, guarda la respuesta del servidor en `mensajes` y elimina cada documento de `mensajes-offline` solo después de una respuesta exitosa.

Si una petición falla, el documento pendiente no se elimina y Background Sync puede reintentarlo.

**Validación:** crear mensajes con la aplicación offline, comprobar `mensajes-offline`, volver a conectar la red y observar el evento `sync`. Confirmar que los documentos pasan a `mensajes`, aparecen en MongoDB y desaparecen de `mensajes-offline`.

## 5. Actualización del caché dinámico

**Implementación:** después de enviar los pendientes, el Service Worker consulta nuevamente `GET /api` y reemplaza la entrada `/api` del caché dinámico. `getMensajes` limpia el timeline antes de renderizar la respuesta, evitando duplicados si la vista se actualiza.

**Validación:** sincronizar un mensaje offline, recargar la página y consultar Application > Cache Storage > `dynamic-v1`. La respuesta de `/api` debe contener cada mensaje una sola vez y coincidir con MongoDB.

## 6. Notificaciones Toast

**Implementación:** se usa `$.mdtoast` para notificar conexión restaurada, modo offline, mensaje guardado, mensaje pendiente, sincronización completada y errores de red o base de datos. El Service Worker informa al cliente cuántos mensajes fueron sincronizados.

**Validación:** activar y desactivar la red desde DevTools > Network y crear mensajes. Deben aparecer Toasts diferentes para offline, guardado pendiente, conexión restaurada, sincronización exitosa y errores.

## 7. GET desde la base de datos y actualización local

Pendiente de implementación.
