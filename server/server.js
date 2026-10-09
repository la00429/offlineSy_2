const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const connectDatabase = require('./db');


const app = express();


const publicPath = path.resolve(__dirname, '../public');
const port = process.env.PORT || 3000;


app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies


// Directorio Público
app.use(express.static(publicPath));

// Rutas
const routes = require('./routes');
app.use('/api', routes );

async function startServer() {
    try {
        await connectDatabase();
        app.listen(port, () => {
            console.log(`Servidor corriendo en puerto ${ port }`);
        });
    } catch (error) {
        console.error('No se pudo conectar a MongoDB:', error.message);
        process.exitCode = 1;
    }
}

startServer();