import { prisma } from '../lib/prisma';
import { hashPin } from '../utils/auth';

export const userService = {
  // Ambil semua user (Sembunyikan pinHash agar aman)
  getAllUsers: async () => {
    return await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        permissions: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
  },

  // Ambil detail 1 user
  getUserById: async (id: number) => {
    return await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        permissions: true,
        isActive: true,
        lastLoginAt: true
      }
    });
  },

  // Tambah Staff/Kasir Baru
  createUser: async (data: { username: string; name: string; pin: string; role?: 'owner' | 'staff'; permissions?: any; isActive?: boolean }) => {
    return await prisma.user.create({
      data: {
        username: data.username.toLowerCase(),
        name: data.name,
        pinHash: hashPin(String(data.pin)), // PIN langsung di-hash (scrypt + salt)
        role: data.role || 'staff',
        permissions: data.permissions || [],
        isActive: data.isActive !== undefined ? data.isActive : true
      },
      select: { id: true, username: true, name: true, role: true } // Jangan kembalikan PIN
    });
  },

  // Edit User (Ganti Nama, PIN, atau Status Aktif).
  //
  // PENTING: `role` dan `permissions` SENGAJA tidak ikut di-bind dari body.
  // Role/permission adalah keputusan otorisasi, bukan data profil yang boleh
  // diubah lewat endpoint update biasa — memassanya dari request body
  // memungkinkan eskalasi privilege. Perubahan role harus lewat jalur
  // terpisah (lihat userController.updateRole) dengan verifikasi tambahan.
  updateUser: async (id: number, data: { username?: string; name?: string; pin?: string; isActive?: boolean }) => {
    const updateData: any = {
      username: data.username?.toLowerCase(),
      name: data.name,
      isActive: data.isActive
    };

    // Jika admin mengisi kolom PIN baru, enkripsi PIN tersebut
    if (data.pin && data.pin.trim() !== '') {
      updateData.pinHash = hashPin(String(data.pin));
    }

    return await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, username: true, name: true, role: true, isActive: true }
    });
  },

  // Ubah role/permissions secara eksplisit.
  //
  // Dipisah dari updateUser supaya role change selalu melewati satu tempat
  // yang eksplisit (dengan jejak audit), bukan ikut ter-mass-assign dari
  // body endpoint update biasa.
  updateRole: async (id: number, role: 'owner' | 'staff', permissions?: any) => {
    return await prisma.user.update({
      where: { id },
      data: {
        role,
        ...(permissions !== undefined ? { permissions } : {}),
      },
      select: { id: true, username: true, role: true, permissions: true, isActive: true },
    });
  },

  // Hapus User (Ubah status isActive menjadi false agar datanya tidak hilang dari riwayat transaksi)
  deleteUser: async (id: number) => {
    return await prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, username: true, isActive: true }
    });
  }
};