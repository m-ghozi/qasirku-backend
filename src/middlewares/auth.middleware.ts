import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../utils/auth';

// Memperluas tipe data bawaan Express agar mengenali 'req.user'
declare global {
  namespace Express {
    interface Request {
      user?: any; // Anda bisa membuat interface khusus nanti, sementara pakai 'any'
    }
  }
}

export const verifyToken = (req: Request, res: Response, next: NextFunction): void => {
  // 1. Ambil header Authorization dari request
  const authHeader = req.headers.authorization;

  // 2. Cek apakah formatnya benar (harus dimulai dengan 'Bearer ')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Akses ditolak. Token tidak ditemukan.' });
    return;
  }

  // 3. Ekstrak token (membuang kata "Bearer ")
  const token = authHeader.split(' ')[1];

  // 4. Ambil Secret Key dari .env. Sengaja dilakukan di luar try/catch:
  //    JWT_SECRET yang hilang adalah miskonfigurasi server (500), bukan kegagalan auth user.
  const secret = getJwtSecret();

  try {
    // 5. Verifikasi keaslian token
    const decoded = jwt.verify(token, secret);

    // 6. Jika valid, simpan data user (id, role, dll) ke dalam 'req.user'
    req.user = decoded;

    // 7. Izinkan request masuk ke Controller (tahap selanjutnya)
    next();
  } catch (error) {
    // Token kedaluwarsa / tanda tangan tidak valid = kegagalan autentikasi → 401
    // (401 = sesi tidak valid, konsisten dengan cek "token tidak ditemukan" di atas.
    //  403 dipakai khusus untuk user terautentikasi yang tidak punya izin.)
    res.status(401).json({ success: false, message: 'Sesi berakhir atau token tidak valid. Silakan login ulang.' });
    return;
  }
};