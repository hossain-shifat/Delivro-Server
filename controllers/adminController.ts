import { Request, Response } from "express";
import User from "../models/User.js";
import Product from "../models/Products.js";
import Order from "../models/Order.js";

const normalizeOrder = (order: any) => {
    // guarantee numeric fields for frontend toFixed calls and compute missing values
    const items =
        order.items?.map((item: any) => {
            if (item.price == null) {
                const productPrice = (item.product as any)?.price;
                item.price = productPrice ?? 0;
            }
            if (item.quantity == null) item.quantity = 1;
            return item;
        }) ?? [];

    const subtotalFromItems = items.reduce(
        (sum: number, item: any) => sum + (item.price ?? 0) * (item.quantity ?? 1),
        0,
    );

    const subtotal =
        order.subtotal == null || (order.subtotal <= 0 && subtotalFromItems > 0)
            ? subtotalFromItems
            : order.subtotal;

    const shippingCost =
        order.shippingCost == null || order.shippingCost <= 0 ? 2 : order.shippingCost;
    const tax = order.tax ?? 0;

    const computedTotal = (subtotal || 0) + (shippingCost || 0) + (tax || 0);
    const totalAmount =
        order.totalAmount == null || (order.totalAmount <= 0 && computedTotal > 0)
            ? computedTotal
            : order.totalAmount;

    return {
        ...order,
        subtotal,
        shippingCost,
        tax,
        totalAmount,
        items,
    };
};

// Get dashboard stats
// Get /api/admin/stats

export const getDashboardStats = async (req: Request, res: Response) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalProducts = await Product.countDocuments();
        const totalOrders = await Order.countDocuments();

        const validOrders = await Order.find({
            orderStatus: { $ne: "cancelled" },
        });
        const totalRevenue = validOrders.reduce((sum, order) => {
            const shipping = order.shippingCost ?? 0;
            const tax = order.tax ?? 0;
            const subtotal = order.subtotal ?? 0;
            const computed = subtotal + shipping + tax;
            const total =
                order.totalAmount == null || order.totalAmount <= 0
                    ? computed
                    : order.totalAmount;
            return sum + total;
        }, 0);

        const recentOrdersRaw = await Order.find()
            .sort("-createdAt")
            .limit(5)
            .populate("user", "name email")
            .populate("items.product", "name price images");

        const recentOrders = recentOrdersRaw.map((o) => {
            const obj = o.toObject ? o.toObject() : o;
            return normalizeOrder(obj);
        });

        res.json({
            success:true,
            data:{
                totalUsers,
                totalProducts,
                totalOrders,
                totalRevenue,
                recentOrders
            }
        })

    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};
