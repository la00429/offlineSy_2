

// Guardar  en el cache dinamico
function actualizaCacheDinamico( dynamicCache, req, res ) {


    if ( res.ok ) {

        return caches.open( dynamicCache ).then( cache => {

            cache.put( req, res.clone() );
            
            return res.clone();

        });

    } else {
        return res;
    }

}

// Cache with network update
function actualizaCacheStatico( staticCache, req, APP_SHELL_INMUTABLE ) {


    if ( APP_SHELL_INMUTABLE.includes(req.url) ) {
        // No hace falta actualizar el inmutable
        // console.log('existe en inmutable', req.url );

    } else {
        // console.log('actualizando', req.url );
        return fetch( req )
                .then( res => {
                    return actualizaCacheDinamico( staticCache, req, res );
                });
    }


}


// Network with cache fallback / update
function manejoApiMensajes( cacheName, req ) {


    if ( req.clone().method === 'POST' ) {
        return req.clone().text().then(body => {
            const bodyObj = JSON.parse(body);

            return fetch(req.clone()).then(res => {
                if (res.ok) {
                    return res;
                }

                if (res.status >= 500) {
                    return guardarMensajeOffline(bodyObj);
                }

                return res;
            }).catch(() => guardarMensajeOffline(bodyObj));
        });


    } else {

        return fetch( req ).then( res => {
    
            if ( res.ok ) {
                const respuesta = res.clone();
                return res.clone().json()
                    .then(mensajes => guardarMensajesLocales(mensajes))
                    .then(() => actualizaCacheDinamico(cacheName, req, respuesta));
            } else {
                return caches.match( req );
            }
      
        }).catch( err => {
            return caches.match(req).then(respuesta => {
                if (respuesta) {
                    return respuesta;
                }

                return listarMensajesLocales().then(docs => new Response(
                    JSON.stringify(docs.rows.map(row => row.doc)),
                    { headers: { 'Content-Type': 'application/json' } }
                ));
            });
        });

    }


}

function actualizarCacheMensajes(dynamicCache) {
    const request = new Request('/api', { method: 'GET' });

    return fetch(request).then(res => {
        if (!res.ok) {
            return res;
        }

        return caches.open(dynamicCache).then(cache => {
            return cache.put(request, res.clone()).then(() => res);
        });
    });
}

