const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config(); // Load environment variables

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
//app.use(express.static('public'));

// MongoDB Atlas Connection
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI tidak ditemukan di file .env');
  process.exit(1);
}

console.log('Menghubungkan ke MongoDB Atlas...');

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const db = mongoose.connection;

db.on('error', (error) => {
  console.error('MongoDB connection error:', error);
});

db.once('open', () => {
  console.log('✅ Berhasil terhubung ke MongoDB Atlas');
  console.log('📍 Database: smart_charity_box');
});

db.on('disconnected', () => {
  console.log('⚠️ MongoDB Atlas terputus');
});

db.on('reconnected', () => {
  console.log('🔄 MongoDB Atlas tersambung kembali');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Menerima sinyal shutdown...');
  try {
    await mongoose.connection.close();
    console.log('✅ Koneksi MongoDB ditutup dengan baik');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error saat shutdown:', error);
    process.exit(1);
  }
});

// Schema untuk data donasi
const donationSchema = new mongoose.Schema({
  nominal: {
    type: Number,
    required: true,
    min: 1
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  deviceId: {
    type: String,
    default: 'smart_charity_box_01'
  }
}, {
  timestamps: true // Menambahkan createdAt dan updatedAt otomatis
});

const Donation = mongoose.model('Donation', donationSchema);

// Schema untuk riwayat donasi
const historySchema = new mongoose.Schema({
  nominal: {
    type: Number,
    required: true,
    min: 1
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  deviceId: {
    type: String,
    default: 'smart_charity_box_01'
  }
}, {
  timestamps: true
});

const History = mongoose.model('History', historySchema);

// Routes

// Health check endpoint
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({ 
    status: 'OK',
    app: process.env.APP_NAME || 'Smart Charity Box Server',
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
      type: 'MongoDB Atlas'
    },
    server: {
      port: PORT,
      environment: process.env.NODE_ENV || 'development'
    }
  });
});

// Serve halaman utama
// app.get('/', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

// API untuk menerima data dari ESP32
app.post('/api/donation', async (req, res) => {
  try {
    const { nominal, deviceId } = req.body;
    
    // Validasi input
    if (!nominal || typeof nominal !== 'number' || nominal <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nominal harus berupa angka positif yang valid' 
      });
    }

    // Buat record donasi baru
    const newDonation = new Donation({
      nominal: nominal,
      deviceId: deviceId || 'smart_charity_box_01'
    });

    // Buat record history baru
    const newHistory = new History({
      nominal: nominal,
      deviceId: deviceId || 'smart_charity_box_01'
    });
    
    // Simpan ke database
    await Promise.all([
      newDonation.save(),
      newHistory.save()
    ]);
    
    console.log(`💰 Donasi baru: Rp ${nominal.toLocaleString('id-ID')} dari ${deviceId || 'smart_charity_box_01'}`);
    
    res.json({ 
      success: true, 
      message: 'Data donasi berhasil disimpan ke MongoDB Atlas',
      data: {
        id: newDonation._id,
        nominal: newDonation.nominal,
        deviceId: newDonation.deviceId,
        timestamp: newDonation.timestamp
      }
    });
  } catch (error) {
    console.error('❌ Error saving donation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error menyimpan data ke database',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// API untuk mendapatkan total donasi
app.get('/api/total', async (req, res) => {
  try {
    const result = await Donation.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: '$nominal' },
          count: { $sum: 1 }
        }
      }
    ]);

    const total = result.length > 0 ? result[0].total : 0;
    const count = result.length > 0 ? result[0].count : 0;

    res.json({
      success: true,
      total: total,
      count: count,
      formatted: {
        total: `Rp ${total.toLocaleString('id-ID')}`,
        count: `${count} donasi`
      }
    });
  } catch (error) {
    console.error('❌ Error getting total:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error mengambil data total dari database' 
    });
  }
});

// API untuk mendapatkan history donasi
app.get('/api/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 100); // Max 100 records
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const skip = (page - 1) * limit;

    const histories = await History.find()
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(skip);

    const totalRecords = await History.countDocuments();

    res.json({
      success: true,
      data: histories,
      pagination: {
        page: page,
        limit: limit,
        total: totalRecords,
        totalPages: Math.ceil(totalRecords / limit)
      }
    });
  } catch (error) {
    console.error('❌ Error getting history:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error mengambil history dari database' 
    });
  }
});

// API untuk mendapatkan statistik harian
app.get('/api/daily-stats', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dailyStats = await Donation.aggregate([
      {
        $match: {
          timestamp: {
            $gte: today,
            $lt: tomorrow
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$nominal' },
          count: { $sum: 1 }
        }
      }
    ]);

    const total = dailyStats.length > 0 ? dailyStats[0].total : 0;
    const count = dailyStats.length > 0 ? dailyStats[0].count : 0;

    res.json({
      success: true,
      date: today.toISOString().split('T')[0],
      totalToday: total,
      countToday: count,
      formatted: {
        total: `Rp ${total.toLocaleString('id-ID')}`,
        count: `${count} donasi hari ini`
      }
    });
  } catch (error) {
    console.error('❌ Error getting daily stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error mengambil statistik harian' 
    });
  }
});

// Default pesan LCD dalam dua baris
let lcdMessage = {
  line1: "Sedekah membawa",
  line2: "berkah"
};

// Endpoint untuk memperbarui pesan LCD
app.post('/api/lcd-message', (req, res) => {
  try {
    const { line1 = '', line2 = '' } = req.body;

    if (typeof line1 !== 'string' || typeof line2 !== 'string') {
      return res.status(400).json({ 
        success: false, 
        message: 'Format pesan tidak valid. Line1 dan line2 harus berupa string' 
      });
    }

    // Batasi panjang karakter maksimal 16 per baris untuk LCD 16x2
    lcdMessage.line1 = line1.substring(0, 16);
    lcdMessage.line2 = line2.substring(0, 16);

    console.log('📺 Pesan LCD diperbarui:', lcdMessage);
    
    res.json({ 
      success: true, 
      message: 'Pesan LCD berhasil diperbarui',
      data: lcdMessage
    });
  } catch (error) {
    console.error('❌ Error updating LCD message:', error);
    res.status(500).json({
      success: false,
      message: 'Error memperbarui pesan LCD'
    });
  }
});

// Endpoint untuk mendapatkan pesan LCD saat ini
app.get('/api/lcd-message', (req, res) => {
  res.json({ 
    success: true, 
    message: lcdMessage,
    info: 'Maksimal 16 karakter per baris untuk LCD 16x2'
  });
});

// API untuk mereset data donasi (tanpa menghapus history)
app.delete('/api/reset-donations', async (req, res) => {
  try {
    const result = await Donation.deleteMany({});
    
    console.log(`🗑️ Reset donasi: ${result.deletedCount} record dihapus`);
    
    res.json({
      success: true,
      message: 'Semua data donasi berhasil direset',
      deletedCount: result.deletedCount,
      note: 'History donasi tetap tersimpan'
    });
  } catch (error) {
    console.error('❌ Error mereset donasi:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mereset data donasi'
    });
  }
});

// API untuk mendapatkan statistik per periode
app.get('/api/stats/:period', async (req, res) => {
  try {
    const { period } = req.params;
    const now = new Date();
    let startDate;
    let periodName;

    switch (period.toLowerCase()) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        periodName = '7 hari terakhir';
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        periodName = 'bulan ini';
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        periodName = 'tahun ini';
        break;
      default:
        return res.status(400).json({ 
          success: false, 
          message: 'Period tidak valid. Gunakan: week, month, atau year' 
        });
    }

    const stats = await Donation.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$nominal' },
          count: { $sum: 1 },
          avgDonation: { $avg: '$nominal' }
        }
      }
    ]);

    const total = stats.length > 0 ? stats[0].total : 0;
    const count = stats.length > 0 ? stats[0].count : 0;
    const avgDonation = stats.length > 0 ? Math.round(stats[0].avgDonation) : 0;

    res.json({
      success: true,
      period: period,
      periodName: periodName,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      stats: {
        total: total,
        count: count,
        average: avgDonation
      },
      formatted: {
        total: `Rp ${total.toLocaleString('id-ID')}`,
        count: `${count} donasi`,
        average: `Rp ${avgDonation.toLocaleString('id-ID')} per donasi`
      }
    });
  } catch (error) {
    console.error('❌ Error getting period stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error mengambil statistik periode' 
    });
  }
});

// API untuk mendapatkan donasi terbesar
app.get('/api/top-donations', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 5, 20);
    
    const topDonations = await History.find()
      .sort({ nominal: -1 })
      .limit(limit);

    res.json({
      success: true,
      data: topDonations,
      message: `${limit} donasi terbesar`
    });
  } catch (error) {
    console.error('❌ Error getting top donations:', error);
    res.status(500).json({
      success: false,
      message: 'Error mengambil data donasi terbesar'
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Unhandled error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.method} ${req.path} tidak ditemukan`,
    availableEndpoints: [
      'GET /health',
      'GET /',
      'POST /api/donation',
      'GET /api/total',
      'GET /api/history',
      'GET /api/daily-stats',
      'GET /api/stats/:period',
      'GET /api/top-donations',
      'GET /api/lcd-message',
      'POST /api/lcd-message',
      'DELETE /api/reset-donations'
    ]
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Smart Charity Box Server Started');
  console.log(`📍 Server: http://localhost:${PORT}`);
  console.log(`🌍 Public: http://0.0.0.0:${PORT}`);
  console.log(`🗄️ Database: MongoDB Atlas`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('📡 Endpoints:');
  console.log('   - GET /health (server status)');
  console.log('   - POST /api/donation (ESP32 endpoint)');
  console.log('   - GET /api/total (total donasi)');
  console.log('   - GET /api/history (riwayat donasi)');
  console.log('   - GET /api/daily-stats (statistik harian)');
  console.log('✅ Server siap menerima koneksi...\n');
});

module.exports = app;