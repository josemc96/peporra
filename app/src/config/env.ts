const apiUrl = process.env.EXPO_PUBLIC_API_URL;

if (!apiUrl) {
  throw new Error(
    'EXPO_PUBLIC_API_URL no está configurada. Copia .env.example a .env y pon la IP de tu backend.'
  );
}

export const env = {
  apiUrl,
};
