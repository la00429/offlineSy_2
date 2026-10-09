
var url = window.location.href;
var swLocation = '/sw.js';


if ( navigator.serviceWorker ) {


    if ( url.includes('localhost') ) {
        swLocation = '/sw.js';
    }


    navigator.serviceWorker.register( swLocation );
}





// Referencias de jQuery

var titulo      = $('#titulo');
var nuevoBtn    = $('#nuevo-btn');
var salirBtn    = $('#salir-btn');
var cancelarBtn = $('#cancel-btn');
var postBtn     = $('#post-btn');
var avatarSel   = $('#seleccion');
var timeline    = $('#timeline');

var modal       = $('#modal');
var modalAvatar = $('#modal-avatar');
var avatarBtns  = $('.seleccion-avatar');
var txtMensaje  = $('#txtMensaje');

// El usuario, contiene el ID del hÃ©roe seleccionado
var usuario;




// ===== Codigo de la aplicaciÃ³n

function crearMensajeHTML(mensaje, personaje) {

    var content =`
    <li class="animated fadeIn fast">
        <div class="avatar">
            <img src="img/avatars/${ personaje }.jpg">
        </div>
        <div class="bubble-container">
            <div class="bubble">
                <h3>@${ personaje }</h3>
                <br/>
                ${ mensaje }
            </div>
            
            <div class="arrow"></div>
        </div>
    </li>
    `;

    timeline.prepend(content);
    cancelarBtn.click();

}



// Globals
function logIn( ingreso ) {

    if ( ingreso ) {
        nuevoBtn.removeClass('oculto');
        salirBtn.removeClass('oculto');
        timeline.removeClass('oculto');
        avatarSel.addClass('oculto');
        modalAvatar.attr('src', 'img/avatars/' + usuario + '.jpg');
    } else {
        nuevoBtn.addClass('oculto');
        salirBtn.addClass('oculto');
        timeline.addClass('oculto');
        avatarSel.removeClass('oculto');

        titulo.text('Seleccione Personaje');
    
    }

}


// Seleccion de personaje
avatarBtns.on('click', function() {

    usuario = $(this).data('user');

    titulo.text('@' + usuario);

    logIn(true);

});

// Boton de salir
salirBtn.on('click', function() {

    logIn(false);

});

// Boton de nuevo mensaje
nuevoBtn.on('click', function() {

    modal.removeClass('oculto');
    modal.animate({ 
        marginTop: '-=1000px',
        opacity: 1
    }, 200 );

});


// Boton de cancelar mensaje
cancelarBtn.on('click', function() {
    if ( !modal.hasClass('oculto') ) {
        modal.animate({ 
            marginTop: '+=1000px',
            opacity: 0
         }, 200, function() {
             modal.addClass('oculto');
             txtMensaje.val('');
         });
    }
});

// Boton de enviar mensaje
postBtn.on('click', function() {

    var mensaje = txtMensaje.val();
    if ( mensaje.length === 0 ) {
        cancelarBtn.click();
        return;
    }

    var data = {
        mensaje: mensaje,
        user: usuario
    };


    fetch('/api', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify( data )
    })
    .then(res => res.json().then(data => ({ ok: res.ok, data })))
    .then(({ ok, data }) => {
      if (!ok || !data.ok) {
        mostrarErrorToast(data.mensaje || 'No se pudo enviar el mensaje.');
      } else if (data.offline) {
        mostrarToast('Mensaje guardado para sincronizar.', 'warning');
      } else {
        mostrarToast('Mensaje guardado.', 'success');
        crearMensajeHTML(mensaje, usuario);
      }
    })
    .catch(err => mostrarErrorToast(`Error de conexión: ${err.message}`));

});



// Obtener mensajes del servidor
function getMensajes() {
  fetch('/api')
    .then(res => res.json())
    .then(posts => {
      timeline.empty();
      posts.forEach(post => crearMensajeHTML(post.mensaje, post.user));
    })
    .catch(err => {
      console.log('Error al obtener mensajes:', err);
      mostrarErrorToast('No se pudieron obtener los mensajes más recientes.');
    });
}

getMensajes();



// Detectar cambios de conexión
function isOnline() {

    if ( navigator.onLine ) {
      sincronizarMensajesPendientes();
    } else{
        mostrarToast('Sin conexión. Los mensajes quedarán pendientes.', 'warning');
    }

}

    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data && event.data.type === 'mensajes-sincronizados') {
          getMensajes();
          mostrarToast(`${event.data.count} mensaje(s) sincronizado(s).`, 'success');
        }
        if (event.data && event.data.type === 'pendientes-comprobados') {
          if (event.data.count > 0) {
            mostrarToast('Conexión restaurada. Sincronizando mensajes.', 'success');
          }
        }
      });
    }

function sincronizarMensajesPendientes() {
  if (!navigator.serviceWorker) {
    return;
  }

  navigator.serviceWorker.ready.then(registration => {
    if (registration.active) {
      registration.active.postMessage({ type: 'comprobar-pendientes' });
    }
  }).catch(error => {
    mostrarErrorToast(`No se pudo programar la sincronización: ${error.message}`);
  });
}

window.addEventListener('online', isOnline );
window.addEventListener('offline', isOnline );

isOnline();


// Función para enviar mensajes desde la consola (Actividad 3)
function enviarNuevoMensaje(user, mensaje) {
  const payload = {
    user: user,
    mensaje: mensaje
  };

  return fetch('/api', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(res => {
    if (res.ok) {
      console.log('Mensaje creado exitosamente:', res.mensaje);
      crearMensajeHTML(res.mensaje.mensaje, res.mensaje.user);
    } else {
      mostrarErrorToast(res.mensaje || 'Error al enviar mensaje');
    }
  })
  .catch(err => {
    console.error('Error en la petición:', err);
    mostrarErrorToast('Error de conexión o almacenamiento.');
  });
}

// Función auxiliar para mostrar alertas de error (Actividad 5)
function mostrarErrorToast(mensajeError) {
  mostrarToast(mensajeError, 'error');
}

function mostrarToast(mensaje, tipo) {
  if (typeof $.mdtoast === 'function') {
    $.mdtoast(mensaje, {
      interaction: true,
      interactionTimeout: 2500,
      actionText: 'OK',
      type: tipo
    });
  } else {
    console.error('Toast:', mensaje);
  }
}

