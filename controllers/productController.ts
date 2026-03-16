import { Request, response, Response } from "express";
import Product from "../models/Products.js";
import cloudinary from "../config/cloudinary.js";

// get all products

export const getProducts = async (req: Request, res: Response) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const query: any = {};

        const total = await Product.countDocuments(query);
        const products = await Product.find(query)
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit));

        res.json({
            success: true,
            data: products,
            pagination: {
                total,
                page: Number(page),
                pages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get single product
// Get /api/products/:id

export const getProduct = async (req: Request, res: Response) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res
                .status(404)
                .json({ success: false, message: "Product not found" });
        }

        res.json({ success: true, data: product });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Craete Product
// Post /api/products

export const createProduct = async (req: Request, res: Response) => {
    try {
        const { images, sizes, ...rest } = req.body;

        if (!images || images.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please upload at least one image",
            });
        }

        // Parse sizes if it's a string
        let parsedSizes = sizes || [];
        if (typeof parsedSizes === "string") {
            try {
                parsedSizes = JSON.parse(parsedSizes);
            } catch {
                parsedSizes = parsedSizes
                    .split(",")
                    .map((s: string) => s.trim())
                    .filter(Boolean);
            }
        }
        if (!Array.isArray(parsedSizes)) parsedSizes = [parsedSizes];

        const product = await Product.create({
            ...rest,
            images,
            sizes: parsedSizes,
        });
        res.status(201).json({ success: true, data: product });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Update product
// Put /api/product/:id

export const updateProduct = async (req: Request, res: Response) => {
    try {
        let images: string[] = [];

        if (req.body.existingImages) {
            if (Array.isArray(req.body.existingImages)) {
                images = [...req.body.existingImages];
            } else {
                images = [req.body.existingImages];
            }
        }

        // Handle file upload
        if (req.files && (req.files as any).length > 0) {
            const uploadPromises = (req.files as any).map((file: any) => {
                return new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        { folder: "delivro/products" },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result!.secure_url);
                        },
                    );
                    uploadStream.end(file.buffer);
                });
            });
            const newImages = await Promise.all(uploadPromises);
            images = [...images, ...newImages];
        }

        const updates = { ...req.body };
        if (req.body.sizes) {
            let sizes = req.body.sizes;

            if (typeof sizes === "string") {
                try {
                    sizes = JSON.parse(sizes);
                } catch (error) {
                    sizes = sizes
                        .split(",")
                        .map((s: string) => s.trim())
                        .filter((s: string) => s !== "");
                }
            }
            if (!Array.isArray(sizes)) sizes = [sizes];
            updates.sizes = sizes;
        }

        if (
            req.body.existingImages ||
            (req.files && (req.files as any).length > 0)
        ) {
            updates.images = images;
        }

        delete updates.existingImages;

        const product = await Product.findByIdAndUpdate(
            req.params.id,
            updates,
            {
                new: true,
                runValidators: true,
            },
        );

        if (!product) {
            return res
                .status(404)
                .json({ success: false, message: "Product not found" });
        }

        res.status(200).json({ success: true, data: product });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete Product
// Delete /api/product/:id

export const deleteProduct = async (req: Request, res: Response) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res
                .status(404)
                .json({ success: false, message: "Product not found" });
        }

        // Delete image from cloudinary
        if (product.images && product.images.length > 0) {
            const deletePromises = product.images.map((imageUrl) => {
                const publicIdMatch = imageUrl.match(/\/v\d+\/(.+).[a-z]+$/);
                const publicId = publicIdMatch ? publicIdMatch[1] : null;
                if (publicId) {
                    return cloudinary.uploader.destroy(publicId);
                }
                return Promise.resolve();
            });
            await Promise.all(deletePromises);
        }

        await Product.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Product deleted" });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};
