const mongoose = require('mongoose');

const solicitudAmistadSchema = new mongoose.Schema({
    solicitante: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true
    },
    receptor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true
    },
    estado: {
        type: String,
        enum: ['pendiente', 'aceptada', 'rechazada'],
        default: 'pendiente'
    }
}, {
    timestamps: true,
    collection: 'solicitudes_amistad'
});

solicitudAmistadSchema.index({ solicitante: 1, receptor: 1 }, { unique: true });

module.exports = mongoose.model('SolicitudAmistad', solicitudAmistadSchema);
