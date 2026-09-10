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

  // Edit User (Ganti Nama, Role, atau PIN)
  updateUser: async (id: number, data: { username?: string; name?: string; pin?: string; role?: 'owner' | 'staff'; permissions?: any; isActive?: boolean }) => {
    const updateData: any = {
      username: data.username?.toLowerCase(),
      name: data.name,
      role: data.role,
      permissions: data.permissions,
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

  // Hapus User (Ubah status isActive menjadi false agar datanya tidak hilang dari riwayat transaksi)
  deleteUser: async (id: number) => {
    return await prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, username: true, isActive: true }
    });
  }
};