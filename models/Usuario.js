const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const usuarioSchema = new mongoose.Schema({
    foto:{ type: String, required: false},
    nombre:{ type: String, required: true},
    email:{ type: String, required: true, unique: true},
    password:{ type: String, required: true},
    grupos:{ type: [mongoose.Schema.Types.ObjectId], ref: 'Grupo', required: false},
    amigos:{ type: [mongoose.Schema.Types.ObjectId], ref: 'Usuario', required: false},
    isAdmin: { type: Boolean, default: false},
    resetPasswordToken: String,
    resetPasswordExpires: Date,
},
{collection: 'usuarios'}
);

usuarioSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('Usuario', usuarioSchema);