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

Pendiente de implementación.

## 5. Actualización del caché dinámico

Pendiente de implementación.

## 6. Notificaciones Toast

Pendiente de implementación.

## 7. GET desde la base de datos y actualización local

Pendiente de implementación.
