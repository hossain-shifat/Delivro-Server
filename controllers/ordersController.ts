import { Request, Response } from "express";
import Order from "../models/Order.js";
import Cart from "../models/Cart.js";
import Product from "../models/Products.js";

const ensureTotals = (order: any) => {
    // derive subtotal when missing or obviously wrong (0 with priced items)
    const subtotalFromItems = Array.isArray(order.items)
        ? order.items.reduce((sum: number, item: any) => {
              const price = item.price ?? (item.product as any)?.price ?? 0;
              const qty = item.quantity ?? 1;
              return sum + price * qty;
          }, 0)
        : 0;

    if (
        order.subtotal == null ||
        (order.subtotal <= 0 && subtotalFromItems > 0)
    ) {
        order.subtotal = subtotalFromItems;
    }

    if (order.shippingCost == null || order.shippingCost <= 0)
        order.shippingCost = 2;
    if (order.tax == null) order.tax = 0;

    const computedTotal =
        (order.subtotal || 0) + (order.shippingCost || 0) + (order.tax || 0);

    // Recompute when missing or obviously incorrect (0 while we have a subtotal)
    if (
        order.totalAmount == null ||
        (order.totalAmount <= 0 && computedTotal > 0)
    ) {
        order.totalAmount = computedTotal;
    }

    return order;
};

const hydrateItemPrices = (order: any) => {
    if (!order.items) return order;
    order.items = order.items.map((item: any) => {
        if (item.price == null) {
            const productPrice = (item.product as any)?.price;
            item.price = productPrice ?? 0;
        }
        return item;
    });
    return order;
};

// Get user orders
// Get /api/orders

export const getOrders = async (req: Request, res: Response) => {
    try {
        const query = { user: req.user._id };
        const order = await Order.find(query)
            // include images so clients can render product thumbnails in order history
            .populate("items.product", "name images price")
            .sort("-createdAt");

        const normalized = order.map((o) => ensureTotals(hydrateItemPrices(o)));

        res.json({ success: true, data: normalized });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get single orders
// Get /api/orders/:id

export const getOrder = async (req: Request, res: Response) => {
    try {
        const order = await Order.findById(req.params.id).populate(
            "items.product",
            "name images",
        );
        if (!order) {
            return res
                .status(404)
                .json({ success: false, message: "Order not found" });
        }
        if (
            order.user.toString() !== req.user._id.toString() &&
            req.user.role !== "admin"
        ) {
            return res
                .status(403)
                .json({ success: false, message: "Not authorized" });
        }

        res.json({
            success: true,
            data: ensureTotals(hydrateItemPrices(order)),
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// create orders from cart
// post /api/orders

export const createOrder = async (req: Request, res: Response) => {
    try {
        const { shippingAddress, notes } = req.body;
        const cart = await Cart.findOne({ user: req.user._id }).populate(
            "items.product",
        );

        if (!cart || cart.items.length === 0) {
            return res
                .status(400)
                .json({ success: false, message: "Cart is empty" });
        }

        // verify stock and prepare order item
        const orderItems = [];
        for (const item of cart.items) {
            const product = await Product.findById(item.product._id);
            if (!product || product.stock < item.quantity) {
                return res.status(400).json({
                    success: true,
                    message: `Insufficient stock for ${(item.product as any).name}`,
                });
            }
            orderItems.push({
                product: item.product._id,
                name: (item.product as any).name,
                quantity: item.quantity,
                price: item.price,
                size: item.size,
            });
            // Reduce stock
            product.stock -= item.quantity;
            await product.save();
        }

        const subtotal = cart.totalAmount;
        const shippingCost = 2;
        const tax = 0;
        const totalAmount = subtotal + shippingCost + tax;

        const order = await Order.create({
            user: req.user._id,
            items: orderItems,
            shippingAddress,
            paymentMethod: req.body.paymentMethod || "cash",
            paymentStatus: "pending",
            subtotal,
            shippingCost,
            tax,
            totalAmount,
            notes,
            paymentIntentId: req.body.paymentIntentId,
            orderNumber: "ORD-" + Date.now(),
        });

        if (req.body.paymentMethod !== "stripe") {
            cart.items = [];
            cart.totalAmount = 0;
            await cart.save();
        }

        res.status(201).json({ success: true, data: order });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// update order status
// put /api/orders/:id/status

export const updateOrderStatus = async (req: Request, res: Response) => {
    try {
        const { orderStatus, paymentStatus } = req.body;
        const allowedOrderStatuses = [
            "placed",
            "processing",
            "shipped",
            "delivered",
            "cancelled",
        ];
        const allowedPaymentStatuses = [
            "pending",
            "paid",
            "failed",
            "refund",
            "refunded",
        ];

        if (!orderStatus && !paymentStatus) {
            return res.status(400).json({
                success: false,
                message: "Provide orderStatus or paymentStatus to update",
            });
        }

        if (orderStatus && !allowedOrderStatuses.includes(orderStatus)) {
            return res.status(400).json({
                success: false,
                message: "Invalid order status value",
            });
        }

        if (paymentStatus && !allowedPaymentStatuses.includes(paymentStatus)) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment status value",
            });
        }

        const update: any = {};
        if (orderStatus) update.orderStatus = orderStatus;
        if (paymentStatus) update.paymentStatus = paymentStatus;
        if (orderStatus === "delivered") update.deliveredAt = new Date();

        const order = await Order.findByIdAndUpdate(
            req.params.id,
            { $set: update },
            {
                returnDocument: "after",
                // Skip full document validation to avoid legacy records with missing optional fields throwing 500s
                runValidators: false,
            },
        );

        if (!order) {
            return res
                .status(404)
                .json({ success: false, message: "Order not found" });
        }

        const normalized = ensureTotals(hydrateItemPrices(order));
        if (!normalized.paymentMethod) normalized.paymentMethod = "cash";
        if (!normalized.paymentStatus) normalized.paymentStatus = "pending";

        res.json({
            success: true,
            data: normalized,
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get all orders
// Get /api/orders/admin/all

export const getAllOrders = async (req: Request, res: Response) => {
    try {
        const { page = 1, limit = 20, status } = req.query;
        const query: any = {};

        if (status) query.orderStatus = status;

        const total = await Order.countDocuments(query);

        const orders = await Order.find(query)
            .populate("user", "name email")
            .populate("items.product", "name images price")
            .sort("-createdAt")
            .skip((Number(page) - 1) * Number(limit));

        const normalized = orders.map((o) =>
            ensureTotals(hydrateItemPrices(o)),
        );

        res.json({
            success: true,
            data: normalized,
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
