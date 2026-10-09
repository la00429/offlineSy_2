// PouchDB conserva la copia confirmada; los pendientes usan IndexedDB nativo.
const dbMensajes = new PouchDB('mensajes');
const offlineDatabaseName = 'offline-synchronization';
const offlineStoreName = 'mensajes-offline';

function abrirBaseOffline() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(offlineDatabaseName, 1);

        request.onupgradeneeded = event => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(offlineStoreName)) {
                database.createObjectStore(offlineStoreName, { keyPath: '_id' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function guardarDocumentoOffline(documento) {
    return abrirBaseOffline().then(database => new Promise((resolve, reject) => {
        const transaction = database.transaction(offlineStoreName, 'readwrite');
        transaction.objectStore(offlineStoreName).put(documento);
        transaction.oncomplete = () => {
            database.close();
            resolve();
        };
        transaction.onerror = () => {
            database.close();
            reject(transaction.error);
        };
    }));
}

function guardarMensajeOffline(mensaje) {
    const documento = {
        _id: `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        user: mensaje.user,
        mensaje: mensaje.mensaje
    };

    return guardarDocumentoOffline(documento).then(() => {
        if (self.registration.sync) {
            return self.registration.sync.register('nuevo-post');
        }
    }).then(() => {

        return new Response(JSON.stringify({
            ok: true,
            offline: true,
            mensaje: documento
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    });
}

function listarMensajesOffline() {
    return abrirBaseOffline().then(database => new Promise((resolve, reject) => {
        const request = database.transaction(offlineStoreName, 'readonly')
            .objectStore(offlineStoreName)
            .getAll();
        request.onsuccess = () => {
            database.close();
            resolve({ rows: request.result.map(doc => ({ doc })) });
        };
        request.onerror = () => {
            database.close();
            reject(request.error);
        };
    }));
}

function eliminarMensajeOffline(documento) {
    return abrirBaseOffline().then(database => new Promise((resolve, reject) => {
        const transaction = database.transaction(offlineStoreName, 'readwrite');
        transaction.objectStore(offlineStoreName).delete(documento._id);
        transaction.oncomplete = () => {
            database.close();
            resolve();
        };
        transaction.onerror = () => {
            database.close();
            reject(transaction.error);
        };
    }));
}

function guardarMensajesLocales(mensajes) {
    return dbMensajes.allDocs({ include_docs: true }).then(docs => {
        const documentosActuales = docs.rows.map(row => row.doc);
        const documentosPorId = new Map(
            documentosActuales.map(documento => [String(documento._id), documento])
        );
        const idsNuevos = new Set(mensajes.map(mensaje => String(mensaje._id)));
        const eliminaciones = documentosActuales
            .filter(documento => !idsNuevos.has(String(documento._id)))
            .map(documento => ({
                _id: documento._id,
                _rev: documento._rev,
                _deleted: true
            }));

        return dbMensajes.bulkDocs([
            ...mensajes.map(mensaje => {
                const id = String(mensaje._id);
                const documentoActual = documentosPorId.get(id);
                return {
                    ...mensaje,
                    _id: id,
                    ...(documentoActual ? { _rev: documentoActual._rev } : {})
                };
            }),
            ...eliminaciones
        ]);
    });
}

function listarMensajesLocales() {
    return dbMensajes.allDocs({ include_docs: true });
}

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
                    throw new Error(respuestaJson.mensaje || 'No se pudo sincronizar el mensaje.');
                }

                return dbMensajes.put({
                    ...respuestaJson.mensaje,
                    _id: String(respuestaJson.mensaje._id)
                }).then(() => eliminarMensajeOffline(documento))
                    .then(() => respuestaJson.mensaje);
            });
        });

        return Promise.all(posteos);
    });
}

self.addEventListener('message', event => {
    if (!event.data || event.data.type !== 'comprobar-pendientes') {
        return;
    }

    event.waitUntil(
        listarMensajesOffline().then(docs => {
            const count = docs.rows.length;
            const sincronizacion = count && self.registration.sync
                ? self.registration.sync.register('nuevo-post')
                : Promise.resolve();

            return sincronizacion.then(() => {
                if (event.source) {
                    event.source.postMessage({
                        type: 'pendientes-comprobados',
                        count: count
                    });
                }
            });
        })
    );
});

