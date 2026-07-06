import mongoose from 'mongoose';
import { env } from './env';

export async function connectDB(): Promise<void> {
  mongoose.connection.on('connected', () => {
    console.log('MongoDB conectado');
  });

  mongoose.connection.on('error', (err) => {
    console.error('Error de conexión a MongoDB:', err);
  });

  await mongoose.connect(env.mongodbUri);
}
