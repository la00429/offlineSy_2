require('dotenv').config();
const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/offlineSy';

async function connectDatabase() {
  await mongoose.connect(mongoUri);
  console.log('Conectado a MongoDB');
}

module.exports = connectDatabase;
