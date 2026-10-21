import { Request, Response, NextFunction } from 'express';

// Terima angka dengan berbagai format:
//   - "5000"          → 5000
//   - "5000.50"       → 5000.50 (standar)
//   - "5000,50"       → 5000.50 (Indonesia: koma desimal)
//   - "5.000,50"      → 5000.50 (Indonesia: period ribuan + koma desimal)
function toNumber(value: any): number | null {
    if (value === undefined || value === null || value === '') return null;

    let str = String(value);

    // 1. Jika ada koma, gunakan koma sebagai titik pembatas desimal
    //    contoh: "5000,50" → "5000.50", "5.000,50" → "5.000.50"
    if (str.includes(',')) {
      // Hilangkan period ribuan (titik di antara angka) sebelum mengganti koma jadi titik
      // "5.000,50" → "5000,50" → "5000.50"
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // Format standar, hanya ganti koma jadi titik (jika ada)
      str = str.replace(',', '.');
    }

    const n = Number(str);
    return Number.isFinite(n) ? n : null;
}

export function isNonNegativeNumber(value: any): boolean {
    const n = toNumber(value);
    return n !== null && n >= 0;
}

function isNonNegativeInteger(value: any): boolean {
    const n = Number(value);
    return !isNaN(n) && Number.isInteger(n) && n >= 0;
}

// Kuantitas stok/keranjang harus bilangan bulat > 0.
// Nilai negatif pernah lolos dan bisa menaikkan stok lewat decrement negatif.
export const isPositiveInteger = (value: any): boolean => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0;
};

export const validateProduct = (req: Request, res: Response, next: NextFunction) => {
    const { price, hpp, stock, supplierId } = req.body;
    const isUpdate = req.method === 'PUT' || req.method === 'PATCH';

    // Supplier opsional — kalau diisi harus id yang valid.
    if (supplierId !== undefined && supplierId !== null && supplierId !== '') {
        if (!isPositiveInteger(supplierId)) {
            return res.status(400).json({ message: 'Supplier tidak valid' });
        }
    }

    if (!isUpdate && (price === undefined || price === null || price === '')) {
        return res.status(400).json({ message: 'Harga jual wajib diisi' });
    }

    if (!isUpdate || price !== undefined) {
        if (!isNonNegativeNumber(price)) {
            return res.status(400).json({ message: 'Harga jual tidak boleh negatif' });
        }
    }

    if (!isUpdate || hpp !== undefined) {
        if (!isNonNegativeNumber(hpp)) {
            return res.status(400).json({ message: 'HPP tidak boleh negatif' });
        }
    }

    if (!isUpdate || stock !== undefined) {
        if (!isNonNegativeInteger(stock)) {
            return res.status(400).json({ message: 'Stok tidak boleh negatif dan harus bilangan bulat' });
        }
    }

    next();
};