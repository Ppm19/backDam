const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// Conexión a MongoDB
const mongoURI = process.env.MONGODB_URI;

if (!mongoURI) {
  console.error('Error: La variable de entorno MONGODB_URI no está definida.');
  process.exit(1);
}

mongoose.connect(mongoURI)
  .then(() => console.log('MongoDB conectado exitosamente.'))
  .catch(err => {
    console.error('Error al conectar a MongoDB:', err);
    process.exit(1);
});

// Middleware
app.use(cors());
app.use(express.json());

// --- IMPORTAR Y USAR RUTAS MODULARES ---
const rutasUsuario = require('./routes/RutasUsuario');
const rutasGrupo = require('./routes/RutasGrupo');
const rutasSolicitudAmistad = require('./routes/RutasSolicitudAmistad');
const rutasInvitacionGrupo = require('./routes/RutasInvitacionGrupo');
const rutasGasto = require('./routes/RutasGasto');

app.use('/api/usuarios', rutasUsuario);
app.use('/api/grupos', rutasGrupo);
app.use('/api/solicitudes-amistad', rutasSolicitudAmistad);
app.use('/api/invitaciones-grupo', rutasInvitacionGrupo);
app.use('/api/gastos', rutasGasto);

app.get('/', (req, res) => {
  res.send('¡Hola desde el backend de PorPartes!');
});

app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
}); 