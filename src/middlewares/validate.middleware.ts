import { Request, Response, NextFunction } from 'express';

export function isNonNegativeNumber(value: any): boolean {
    const n = Number(value);
    return !isNaN(n) && n >= 0;
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