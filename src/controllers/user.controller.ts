import { Request, Response } from 'express';
import { userService } from '../services/user.service';

export const userController = {
  getAll: async (req: Request, res: Response): Promise<void> => {
    try {
      // Pengecekan Otorisasi: Hanya Owner yang boleh melihat daftar user
      if (req.user?.role !== 'owner') {
        res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Owner yang diizinkan.' });
        return;
      }

      const users = await userService.getAllUsers();
      res.json({ success: true, data: users });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  getById: async (req: Request, res: Response): Promise<void> => {
    try {
      if (req.user?.role !== 'owner') {
        res.status(403).json({ success: false, message: 'Akses ditolak.' });
        return;
      }

      const id = parseInt(req.params.id as string);
      const user = await userService.getUserById(id);

      if (!user) {
        res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        return;
      }

      res.json({ success: true, data: user });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  create: async (req: Request, res: Response): Promise<void> => {
    try {
      if (req.user?.role !== 'owner') {
        res.status(403).json({ success: false, message: 'Akses ditolak.' });
        return;
      }

      const { username, name, pin } = req.body;

      if (!username || !name || !pin) {
        res.status(400).json({ success: false, message: 'Username, Nama, dan PIN wajib diisi!' });
        return;
      }

      const newUser = await userService.createUser(req.body);
      res.status(201).json({ success: true, message: 'Akun kasir berhasil dibuat', data: newUser });
    } catch (error: any) {
      // Tangani error jika username sudah dipakai
      if (error.code === 'P2002' && error.meta?.target?.includes('username')) {
        res.status(400).json({ success: false, message: 'Username tersebut sudah digunakan!' });
        return;
      }
      res.status(500).json({ success: false, message: error.message });
    }
  },

  update: async (req: Request, res: Response): Promise<void> => {
    try {
      if (req.user?.role !== 'owner') {
        res.status(403).json({ success: false, message: 'Akses ditolak.' });
        return;
      }

      const id = parseInt(req.params.id as string);
      const updatedUser = await userService.updateUser(id, req.body);
      res.json({ success: true, message: 'Data akun berhasil diperbarui', data: updatedUser });
    } catch (error: any) {
      if (error.code === 'P2002') {
        res.status(400).json({ success: false, message: 'Username tersebut sudah digunakan!' });
        return;
      }
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * Ubah role dan/atau permissions secara eksplisit.
   *
   * Dipisah dari `update` karena role/permissions adalah keputusan otorisasi,
   * bukan data profil. Endpoint update biasa sengaja mengabaikan kedua field
   * itu supaya tidak bisa di-mass-assign dari body.
   */
  updateRole: async (req: Request, res: Response): Promise<void> => {
    try {
      if (req.user?.role !== 'owner') {
        res.status(403).json({ success: false, message: 'Akses ditolak.' });
        return;
      }

      const id = parseInt(req.params.id as string);
      const { role, permissions } = req.body;

      if (role !== 'owner' && role !== 'staff') {
        res.status(400).json({ success: false, message: 'Role tidak valid.' });
        return;
      }

      if (permissions !== undefined && !Array.isArray(permissions)) {
        res.status(400).json({ success: false, message: 'Permissions tidak valid.' });
        return;
      }

      const updated = await userService.updateRole(id, role, permissions);
      res.json({ success: true, message: 'Hak akses berhasil diperbarui', data: updated });
    } catch (error: any) {
      if (error.code === 'P2025') {
        res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        return;
      }
      res.status(500).json({ success: false, message: error.message });
    }
  },

  delete: async (req: Request, res: Response): Promise<void> => {
    try {
      if (req.user?.role !== 'owner') {
        res.status(403).json({ success: false, message: 'Akses ditolak.' });
        return;
      }

      const id = parseInt(req.params.id as string);

      // Cegah Owner menghapus dirinya sendiri
      if (id === req.user.userId) {
        res.status(400).json({ success: false, message: 'Anda tidak dapat menonaktifkan akun Anda sendiri!' });
        return;
      }

      await userService.deleteUser(id);
      res.json({ success: true, message: 'Akun berhasil dinonaktifkan' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Tambahkan metode baru ini:
  getMe: async (req: Request, res: Response): Promise<void> => {
    try {
      // req.user.userId didapatkan secara otomatis dari token JWT yang sudah di-verify
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Sesi tidak valid.' });
        return;
      }

      // Gunakan service getById yang sudah kita miliki
      const user = await userService.getUserById(userId);

      if (!user) {
        res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
        return;
      }

      if (!user.isActive) {
        res.status(403).json({ success: false, message: 'Akun Anda telah dinonaktifkan.' });
        return;
      }

      res.json({ success: true, data: user });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
};