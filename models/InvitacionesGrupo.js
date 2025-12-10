const mongoose = require('mongoose');

const invitacionGrupoSchema = new mongoose.Schema({
    invitador: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true
    },
    invitado: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true
    },
    grupo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Grupo',
        required: true
    },
    estado: {
        type: String,
        enum: ['pendiente', 'aceptada', 'rechazada'],
        default: 'pendiente'
    }
}, {
    timestamps: true, 
    collection: 'solicitudes_grupo'
});

invitacionGrupoSchema.index({ invitado: 1, grupo: 1, estado: 'pendiente' }, { unique: true, partialFilterExpression: { estado: 'pendiente' } });

module.exports = mongoose.model('InvitacionGrupo', invitacionGrupoSchema); 