const mongoose = require('mongoose');

const grupoSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: [true],
        trim: true
    },
    miembros: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true
    }],
    creador: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true
    },
    moneda: {
        type: String,
        required: [true],
        uppercase: true,
        trim: true,
        default: 'EUR'
    },
    
}, {
    timestamps: true,
    collection: 'grupos'
});

grupoSchema.index({ miembros: 1 });

module.exports = mongoose.model('Grupo', grupoSchema);