# Gunakan image Nginx terbaru sebagai base image
FROM nginx:alpine

# Salin file-file statis frontend Anda ke direktori default Nginx
COPY . /usr/share/nginx/html

# Expose port standar HTTP
EXPOSE 80

# Nginx akan berjalan secara otomatis saat kontainer dimulai
CMD ["nginx", "-g", "daemon off;"]
