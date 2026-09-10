import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { hashPin, verifyPin, isLegacyPinHash, generateToken } from '../utils/auth';

const router = Router();

// Endpoint: POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, pin } = req.body;

    if (!username || !pin) {
      res.status(400).json({ success: false, message: 'Username dan PIN wajib diisi' });
      return;
    }

    // Cari user berdasarkan username
    const user = await prisma.user.findUnique({
      where: { username }
    });

    if (!user || !user.isActive) {
      res.status(401).json({ success: false, message: 'Akun tidak ditemukan atau tidak aktif' });
      return;
    }

    // Validasi PIN (scrypt bersalt; tetap mendukung hash lama SHA-256)
    if (!verifyPin(String(pin), user.pinHash)) {
      res.status(401).json({ success: false, message: 'PIN salah!' });
      return;
    }

    // Upgrade transparan: hash lama (SHA-256 tanpa salt) diganti ke scrypt saat login sukses
    if (isLegacyPinHash(user.pinHash)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { pinHash: hashPin(String(pin)) },
      });
    }

    // Update waktu login terakhir
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Buat JWT Token
    const token = generateToken(user.id, user.role, user.permissions);

    res.json({
      success: true,
      message: 'Login berhasil',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          permissions: user.permissions
        }
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
  }
});

export default router;