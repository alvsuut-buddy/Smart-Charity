# Smart Charity Box 

IoT-Based Smart Charity Management System with Real-time Monitoring. This project is an implementation of an End-to-End IoT system integrating hardware (ESP32) with modern cloud server infrastructure (Kubernetes) to digitize conventional charity boxes.

---

## Key Features

1. Automatic Denomination Detection: Uses TCS3200 color sensor to recognize Indonesian Rupiah.
2. Real-time Monitoring: Web dashboard displays total donations, daily activity, and device status.
3. Remote Control: Admins can send motivational messages to the charity box LCD screen via the website.
4. Scalable Infrastructure: Backend and Frontend are packaged in Docker Containers and orchestrated using K3s (Lightweight Kubernetes).
5. Public Access: Accessible via public domain using Ingress Controller and Cloudflare.

---

## Architecture & Technology

### 1. Hardware (IoT) 
* Microcontroller: ESP32 
* Sensor: TCS3200 (Color Sensor)
* Display: LCD 16x2 I2C

### Pin Map
| Component | Pin Name | ESP32 GPIO Pin |
| :--- | :--- | :--- |
| **TCS3200** | S0 | 3V3 |
| | S1 | 3V3 |
| | S2 | GPIO 2 |
| | S3 | GPIO 15 |
| | LED | 3V3 |
| | OUT | GPIO 4 |
| | VCC | 3V3 |
| | GND | GND |
| **LCD I2C** | SDA | GPIO 21 |
| | SCL | GPIO 22 |
| | VCC | 5V |
| | GND | GND |

### 2. Software (Backend & Frontend) 
* Backend: Node.js, Express.js
* Database: MongoDB Atlas (Cloud NoSQL)
* Frontend: HTML5, CSS3, JavaScript (Fetch API)
* Web Server: Nginx

### 3. Infrastructure (DevOps) 
* Containerization: Docker
* Orchestration: K3s (Kubernetes)
* Server OS: Ubuntu
* Ingress Controller: Traefik
* DNS & CDN: Cloudflare

---

## Repository Structure

* /firmware: Source code for ESP32.
* /backend: Node.js API source code and Dockerfile.
* /frontend: Web Dashboard source code and Nginx Dockerfile.
* /kubernetes: Kubernetes manifests for deployment (Deployment, Service, Ingress).
* /docs: Contains full project documentation, flowcharts, and topology images.
  
---

## How to Run (Deployment)

### Prerequisites
1. Ensure you have a server with Ubuntu OS and SSH access.
2. Install K3s on the server.
3. Set up a MongoDB Atlas cluster.

### Build & Push Docker Images
```bash
# Backend
cd backend
docker build -t mikosangpribumirajin/smart-charity-backend:1.0.1
docker push mikosangpribumirajin/smart-charity-backend:1.0.1

# Frontend
cd frontend
docker build -t mikosangpribumirajin/smart-charity-frontend:1.0.0 .
docker push mikosangpribumirajin/smart-charity-frontend:1.0.0
```
---
## Development Team
* Alvin Oktavian Surya Saputra
* Nafilla Zahra Pramudya
* Nadya Eka Putri
* Baskoro Jatmiko Adi Raharjo
