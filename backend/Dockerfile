# Gunakan image Node.js LTS sebagai base image
FROM node:20-alpine

# Set direktori kerja di dalam kontainer
WORKDIR /app

# Salin package.json dan package-lock.json untuk menginstal dependensi
# Ini dilakukan terpisah agar layer cache bisa digunakan jika hanya kode yang berubah
COPY package.json ./
COPY package-lock.json ./

# Instal dependensi Node.js
RUN npm install --omit=dev

# Salin sisa file aplikasi ke dalam kontainer
COPY . .

# Expose port yang digunakan aplikasi Node.js Anda (misal 3000, sesuaikan jika berbeda)
EXPOSE 3000

# Perintah untuk menjalankan aplikasi Anda
CMD ["node", "server.js"]